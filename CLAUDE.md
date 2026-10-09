# ZYRA — Contexto do projeto (TCC)

> Contexto compartilhado para sessões do Claude Code. Diagnóstico feito em 29/09/2026 a partir da branch `dev` dos três repositórios. Atualize este arquivo conforme o projeto evoluir.

## O projeto

ZYRA é um aplicativo mobile assistente de vestuário para pessoas com daltonismo. É o TCC de Ciência da Computação do Instituto Mauá de Tecnologia (IMT).

- **Autores:** Gustavo Coutinho Arruda (GitHub `guctn`) e Sophia Sissi Curcio Guedes
- **Orientadora:** Ana Claudia Melo Tiessi Gomes de Oliveira

**Problema:** pessoas daltônicas têm dificuldade para identificar cores e combinar roupas. Por isso dependem de terceiros, compram peças da cor errada e repetem combinações "seguras".

A validação com 14 participantes mostrou:
- 100% já pediram ajuda para identificar uma cor;
- 92,9% já compraram roupa achando que era de outra cor;
- 57,1% já deixaram de usar uma peça por medo de errar;
- 78,6% desistiriam do app se o cadastro manual fosse extenso.

Por isso, **baixo esforço de cadastro é requisito central**.

**Três núcleos funcionais:**
1. **Câmera inteligente:** identifica a cor em tempo real e mostra o nome textual e o símbolo **ColorADD** (sistema de Miguel Neiva, entrevistado pelos autores).
2. **Closet virtual:** peças cadastradas progressivamente, a partir de fotos.
3. **Assistente conversacional (IA):** sugere looks por ocasião ou estilo, usando só as peças do usuário.

**Acessibilidade:** a informação de cor nunca deve depender só da cor. Usar sempre nome textual + símbolo ColorADD + alto contraste (WCAG 2.2 e heurísticas de Nielsen).

## Repositórios

| Repo | Stack | Papel |
|---|---|---|
| `sophiasissi/imt-tcc-zyra` | Expo, React Native, TypeScript | App mobile |
| `sophiasissi/imt-tcc-zyra-back` | NestJS, Prisma 7, PostgreSQL, AWS Cognito | API central |
| `sophiasissi/imt-tcc-zyra-vision` | Python, FastAPI, OpenCV, CLIP, OpenAI | Visão computacional |

**Fluxo de Git:** `feature/*` ou `chore/*` → PR para `dev` (branch padrão) → `main`. A `main` é protegida e até agora só tem o commit inicial.

**Convenções:**
- Commits no formato convencional em português (`feat:`, `fix:`, `chore:`, `refactor:`).
- Textos para o usuário, valores de JSON e comentários em português.
- Identificadores de código em inglês no vision e mistos no back/app (ex.: `Usuario`, `cognitoSub`).

## Estado atual

### Back-end (`imt-tcc-zyra-back`)

**Pronto:**
- **Auth via Cognito** (`src/auth`), com as rotas:
  - `POST /auth/signup`, que já grava o perfil no banco com o `userSub`;
  - `confirm-signup`, `resend-code`, `login`, `refresh-token`, `logout`;
  - `forgot-password`, `confirm-forgot-password`;
  - `register-profile` (fallback caso o banco falhe no signup).
- **Guard `CognitoAuthGuard`:** valida o access token e injeta `req.user.cognitoSub`.
- **Perfil:** `GET/PATCH /users/me` (dataNascimento, genero, tipoDaltonismo, nivelDificuldadeLooks 0–5).
- **Erros:** mensagens amigáveis em português, mapeadas a partir dos erros do Cognito (`AuthService.handleCognitoError`).
- **Validação:** `ValidationPipe` global com `whitelist` e `forbidNonWhitelisted`.
- **Qualidade de código:** ESLint, Prettier (aspas simples, printWidth 100) e Husky com lint-staged.

**Schema Prisma:**
- Só o model `Usuario`: id uuid, cognitoSub único, nome, email único, dataNascimento, genero, tipoDaltonismo, nivelDificuldadeLooks e timestamps.
- Enums `Genero` e `TipoDaltonismo`.
- 3 migrations.
- O modelo antigo, com `senhaHash`, `telefone` e `ProvedorAutenticacao`, foi abandonado com a migração para o Cognito.

**Não existe ainda:** model de peça/closet, looks, integração com OpenAI e testes.

**Em andamento:** upload para o S3, numa branch da Sophia.

### Visão (`imt-tcc-zyra-vision`)

Para rodar: `uvicorn src.api.main:app --reload`. O `OPENAI_API_KEY` fica no `.env`.

**`POST /detect-color`** (`src/color_detection`):
1. Recorta o centro da imagem (`CROP_RATIO = 0.12`, alinhado à mira do app).
2. Roda k-means com 3 clusters para achar a cor dominante (a média daria cores falsas com sombra ou estampa).
3. Mapeia a cor por matiz em LCh para as famílias ColorADD: Vermelho, Laranja, Amarelo, Verde, Azul e Roxo.
4. Aplica o tom (`_CLARO` / `_ESCURO`) em relação à cor base da família e detecta pastel.
5. Trata os casos especiais: Castanho e os neutros Preto, Cinza Escuro, Cinza, Cinza Claro e Branco.

O retorno tem `colorName`, `hex`, `colorAddSymbol` (ex.: `COLORADD_AZUL_CLARO`), `rgb`, `confidence` e `warningCode` (`LOW_LIGHT`, `HIGH_LIGHT` ou `LOW_CONFIDENCE`).

**`POST /validate-clothing`** (`src/clothing_analysis/validate_clothing.py`):
- CLIP zero-shot (`openai/clip-vit-base-patch32`).
- Retorna `{isClothing, confidence, reason}`, com `reason` igual a `PERSON_DETECTED` ou `NOT_CLOTHING`.

**`analyze_clothing.py`:**
- Usa o gpt-4o-mini para extrair categoria, estilo e estampa.
- Não está exposto na `dev`.

**Conflito pendente:** a branch `feature/validate-clothing` (Gustavo, 31/08) tem:
- o endpoint `/analyze-clothing` (retornando category, style, pattern, fabric e occasion);
- outro algoritmo de cor;
- imagens de teste.

Ela diverge da correção de cor que já está na `dev` (Sophia, 01/09) e mexe nos mesmos arquivos (`color_mapper.py`, `detect_color.py`). É preciso reconciliar.

### App (`imt-tcc-zyra`)

- **Navegação:** `src/navigation/AppNavigator.tsx`, com native stack e `RootStackParamList` tipado.
- **Serviços:**
  - `src/services/api.ts`: `apiRequest` com `ApiError` (status HTTP e erro de rede) e renovação automática do token em 401 via `setTokenRefresher`;
  - `visionApi.ts`: `detectColorFromImage` e `validateClothingFromImage`. **O app chama a visão direto, sem passar pelo back.**
- **Estado de autenticação:** `src/contexts/AuthContext.tsx`.
- **Símbolos:** `src/utils/colorAddSymbols.ts` mapeia `colorAddSymbol` → label + imagem.
- **Tema e componentes:** `src/styles/theme.ts`; componentes `ZyraButton`, `ZyraInput`, `ZyraPopup`, `OptionPill` e `AuthLayout`.
- **Variáveis de ambiente:** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_VISION_API_URL`.

**Pronto:**
- Splash, Intro e cadastro em 7 etapas (com retomada de cadastro interrompido).
- Login, recuperação de senha, Settings, PersonalInfo, ChangePassword e Permissions.
- Home.
- `CameraColorDetectionScreen`: detecção a cada 800 ms, com símbolo ColorADD e avisos.
- Captura → validação de vestuário → `CapturedClothingScreen`.

**Placeholder ou mock:**
- Closet: o "Selecionar" na Home só loga.
- "Cadastrar nova peça" desabilitado na `CapturedClothingScreen`.
- Galeria na câmera.
- `ChatScreen` é uma demo: um `setTimeout` exibe um SVG fixo (`look_completo.svg`).
- Botão ColorADD da Home sem ação.

## Próximos passos

1. **Visão:** reconciliar o conflito e expor o `/analyze-clothing`.
2. **Back:** criar o model `Peca` (usuarioId, imagemUrl no S3, categoria, cor, hex, colorAddSymbol, estilo, estampa, ocasião), o upload no S3 e o CRUD `/pecas`.
3. **App:** habilitar "Cadastrar nova peça" (branch `feature/cadastro-roupas`, já criada no app e na visão) e criar a tela do closet.
4. **Combinações:** regras no back (categoria, cor, estilo, ocasião).
5. **Chat real:** a OpenAI retorna IDs das peças, e o back valida antes de exibir.
6. **Arquitetura:** decidir se o back vira proxy da visão, o que protege a chave da OpenAI e bate com o artigo.
7. **Qualidade e pesquisa:** testes de usabilidade com usuários.

## Divergências em relação ao artigo (Artigo-TCC1)

O artigo precisa ser atualizado em cinco pontos:
- **Autenticação:** foi escolhido o Cognito, e não JWT próprio.
- **Validação de vestuário:** é feita com CLIP local.
- **Detecção de cor:** usa k-means + LCh, e não só a "região central".
- **Chamadas de visão:** o app fala direto com a API de visão.
- **Telefone:** foi removido do cadastro.

## 08/10/2026: `NAO_TENHO` no tipo de daltonismo

- Novo valor `NAO_TENHO` no enum `TipoDaltonismo` (schema e `src/users/dto/update-profile.dto.ts`). É a resposta "Não tenho" do cadastro e de Informações pessoais no app.
- Migrations:
  - `20261008120000_adiciona_nao_tenho_daltonismo`: só o `ADD VALUE`;
  - `20261008120100_preenche_nao_tenho_daltonismo`: passa para `NAO_TENHO` quem tem o tipo `null` e `dataNascimento` preenchida. Antes, o "Não tenho!" do cadastro deixava o campo vazio.
- `Genero.OUTRO` e `TipoDaltonismo.PREFIRO_NAO_DIZER` não são mais oferecidos pelo app, mas continuam no enum: tirar um valor exige recriar o tipo e falha se alguém o tiver salvo.
- O DTO repete os enums do Prisma à mão. Ao mudar um enum, mude os dois (ou passe a importar de `@prisma/client`).

## 09/10/2026: troca de senha, exclusão de conta e consentimento (sem commit)

- **Migrations** (aplicadas no banco da Sophia em 09/10; quem puxar roda `npx prisma migrate deploy`): as duas do `NAO_TENHO` (08/10) e a `20261009120000_consentimento_dados_saude`. Sem a última, todo `/users/me` dá 500, porque a coluna `consentimentoSaudeEm` não existe.
- `POST /auth/change-password` `{senhaAtual, novaSenha}`: `CognitoAuthGuard` + `ThrottlerGuard` (5 por minuto), com `ChangePasswordCommand`. Senha errada volta como 400, e não 401, porque o app renova o token em qualquer 401.
- `DELETE /users/me` `{senha}`: guard + limite de 5 por minuto.
  - Confere a senha (`AuthService.confirmarSenha`) e, numa transação interativa, apaga o `Usuario` (cascata) e por último a conta no Cognito (`excluirContaNoCognito`, `DeleteUserCommand`). As fotos do S3 saem depois do commit.
  - O `AuthModule` exporta o `AuthService`, e o `UsersModule` o importa.
- O `CognitoAuthGuard` agora põe o token em `req.user.accessToken`.
- Consentimento do dado de saúde: coluna `Usuario.consentimentoSaudeEm`, campo `consentimentoDadosSaude` no DTO, e as regras em `UsersService.consentimentoParaSalvar` (um tipo diferente de `PREFIRO_NAO_DIZER` exige consentimento na primeira vez; `PREFIRO_NAO_DIZER` ou `null` o revogam).
- Atenção: este CLAUDE.md está versionado no git do back (aparece como modificado), apesar do `.gitignore`.

## 09/10/2026 (tarde): aceite dos Termos e e-mail de aviso

- Migration `20261009130000_aceite_termos` (aplicada no banco da Sophia em 09/10), que cria `Usuario.termosAceitosEm` e `versaoTermosAceita`.
  - O `/auth/signup` agora **exige** `versaoTermosAceita` (o app manda) e grava os dois campos no upsert.
  - O `register-profile` aceita o campo como opcional.
- `src/email/` (`EmailModule` global, `EmailService` com SES v2): envia "Sua senha do ZYRA foi alterada" depois de `change-password` e de `confirm-forgot-password`. Nunca lança erro.
- Configuração: `SES_REMETENTE` no `.env` (vazio = só log), remetente verificado no SES us-east-2 e permissão `ses:SendEmail` no IAM. Em sandbox, só chega a destinatários verificados.

## 09/10/2026 (noite): pente fino e commits

- Pente fino:
  - 70 testes passando (22 novos em `test/auth/senha-e-conta.test.ts`, `test/users/` e `test/email/`);
  - rotas novas testadas com o servidor rodando (400 na validação, 401 sem token ou com token falso);
  - banco conferido só com leitura: colunas novas, preenchimento do `NAO_TENHO`, transação interativa no adapter-pg e FKs com `ON DELETE CASCADE`.
- Commits feitos pela Sophia, em 3 grupos: banco; senha, exclusão e e-mail; testes. Este `CLAUDE.md` fica fora dos commits.
- Quem puxar: `npm install` (por causa do `@aws-sdk/client-sesv2`) e `npx prisma migrate deploy`.
