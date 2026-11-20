# Reino dos Guardiões — jogo de estratégia (Tower Defense)

Jogo para celular onde você constrói torres para impedir que os monstros cheguem ao castelo.
São **fases infinitas** (geradas automaticamente, cada uma diferente) e um **chefão a cada 5 fases**.
Tem estrela de 1 a 3, energia, presente diário, melhorias permanentes e loja com dinheiro real.

### 10 Mundos SOMBRIOS × 40 fases = 400 fases
Mundos: Floresta dos Mistérios, Deserto dos Faraós, Pântano dos Mortos, Gelo Encantado, Subterrâneo de Fogo,
Ilha Maldita, Cemitério Assombrado, Cavernas de Cristal, Céu da Tempestade e **Inferno** (larvas de lava que se dividem).
Visual sombrio: escuridão nas bordas, névoa, vagalumes, areia, neve, brasas, chuva com relâmpagos;
monstros com olhos vermelhos brilhando, presas e aura escura. Muito mais monstros por onda.

| # | Mundo | Monstros | Chefão |
|---|---|---|---|
| 1 | 🌳 Floresta Encantada | Gosminha, Goblin, Lobo, Morcego | Rei Ogro |
| 2 | 🏜️ Deserto Escaldante | Escorpião, Múmia, Escaravelho, Abutre | Faraó Esfinge |
| 3 | 🐸 Pântano Sombrio | Sapo, Mosquitão, Crocodilo, Xamã | Bruxa |
| 4 | 🏔️ Montanhas Geladas | Pinguim, Lobo da Neve, Yeti, Espírito | Golem de Gelo |
| 5 | 🌋 Vulcão Flamejante | Diabrete, Salamandra, Fênix, Golem de Magma | Senhor das Chamas |
| 6 | 🏝️ Ilha dos Piratas | Caranguejo, Pirata Esqueleto, Gaivota, Polvo (tinta cega armas) | Kraken |
| 7 | 🪦 Cemitério Assombrado | Zumbi (revive), Esqueleto, Fantasma (invisível), Morcego Vampiro | Conde Vampiro |
| 8 | 💎 Cavernas de Cristal | Aranha (teia prende armas), Toupeira, Morcego de Cristal, Golem de Cristal | Rainha Aranha |
| 9 | ☁️ Reino das Nuvens | Harpia, Duende do Vento, Nuvem Brava (raios), Grifo | Rei Tempestade |
| 10 | 🌑 Abismo Sombrio | Cavaleiro Negro, Demônio, Sombra, Dragão Negro | Senhor das Trevas |

- **Cada fase é mais difícil que a anterior** (as 400 sem exceção): a vida média dos monstros segue uma curva que só sobe
  e a quantidade de monstros nunca diminui — mesmo na troca de mundo.
- Em cada mundo: chefão nas fases 10, 20, 30 e 40; fases longas (2 partes) nas 5, 10, 15...; a fase 40 tem 3 partes;
  lugar misterioso nas fases 7, 17, 27 e 37; baús especiais nas fases 20, 30 e 40.
- Depois do mundo 10 os mundos voltam com os monstros **evoluídos** (armadura bronze → diamante).
- Cartas de arma vão até o **nível 31**. Raridades liberam: Rara fase 5, Épica 20, Lendária 45, Dourada 90, Divina 140.

### Torres e seus poderes
| Torre | Poder |
|---|---|
| 🏹 Arqueira | Flechas rápidas em 1 alvo (acerta voadores) |
| ❄️ Gelo | Estilhaços que deixam **poça congelada** na passarela (monstros ficam lentos) |
| 💣 Canhão | Bala que **explode na passarela** (dano em área, não acerta voadores) |
| 🔱 Lanceiro | **Lança que atravessa** até 3 monstros em linha (libera na fase 9) |
| 🔮 Maga | Raio mágico que acerta 3 monstros |
| 🐉 Dragão (loja) | Bolas de fogo que deixam **fogo queimando** no chão |

### Monstros que atacam as torres
Rei Ogro (pedras), Escorpião e Sapo (veneno), Faraó e Bruxa (**maldição**: a torre para de atirar),
Yeti (bolas de neve), Espírito Gélido (**congela** a torre), Golem de Gelo (blocos de gelo),
Diabrete, Golem de Magma e Senhor das Chamas (fogo/lava).
As torres têm **vida**, podem ser **destruídas** e o jogador pode **consertar** (🔧) pagando ouro.

### Fases longas (em partes)
As fases 5 e 7 de cada mundo têm **2 partes** e a fase 10 tem **3 partes**: depois de algumas ondas o mapa
desliza e o caminho **continua** num mapa novo (as torres viram 75% de ouro para reconstruir).

### Monstros com direção
Vistos de cima (top-down): o corpo gira para a direção da passarela e, andando, mexem pernas e braços; voadores batem as asas com sombra no chão.

### Mapas interativos
- 3 formatos de caminho (zigue-zague, serpente, cascata) + obstáculos do tema de cada mundo.
- ⚠️ **Trechos de armadilha** no caminho: Espinhos, Teia (lentidão) e Bomba.
- 🎁 **Baú** (ouro na hora) e 💎 **Pedra preciosa** (paga ouro, ganha gemas ao vencer — só na 1ª vez).
- 🔍 **Lugar misterioso** (fases 4 e 8 de cada mundo): ache e vença a fase para liberar a
  **Fase Secreta — Caverna do Tesouro** (goblins ladrões; cada um vale moedas, pegar todos dá 💎8; 1 vez só).

## Como o jogo ganha dinheiro
Preços baixos para muita gente comprar (cada compra rende pouco, então o jogador volta a comprar):

| Produto (Google Play) | ID no Play Console | Preço sugerido |
|---|---|---|
| 40 gemas | `gemas_mini` | R$ 0,99 |
| 130 gemas | `gemas_p` | R$ 2,99 |
| 300 gemas | `gemas_m` | R$ 5,99 |
| 700 gemas | `gemas_g` | R$ 12,99 |
| 1.800 gemas | `gemas_xg` | R$ 29,99 |
| Pacote inicial (Dragão + 60 gemas) | `pacote_inicial` | R$ 1,99 |

### 100 armas, raridades e baús
**100 armas** em 20 famílias (arco, besta, canhão, lança, gelo, veneno, magia, balista, tesla, fogo/dragão, sol, vento,
ouro, raio, água, foice, sino, meteoro, olho e espada) e 7 raridades:
Comum (15), Rara (18), Épica (18), Lendária (19), Dourada (10), Divina (12) e **Secreta (8)**.
Poderes: área, lentidão, vários alvos, atravessar, poder no chão (fogo/gelo/água), veneno, empurrar, **paralisar monstros**,
**executar monstros fracos**, **furar escudos**, ouro extra e acertar o mapa inteiro.

**Armas Secretas:** ficam em **relíquias 🗡️ escondidas** na fase 25 de cada mundo. Toque na relíquia e vença a fase
para ganhar a arma (também podem sair, raramente, no Baú dos Deuses).

| Baú | Preço | Cartas |
|---|---|---|
| 📦 Madeira | Grátis a cada 3h / ao vencer | 15 |
| 🥈 Prata | 💎12 ou 🪙500 | 35 |
| 🥇 Ouro | 💎30 ou 🪙1.200 | 90 |
| 🔮 Mágico | 💎70 ou 🪙3.000 | 200 |
| 🔥 Lendário | 💎150 ou 🪙8.000 (garante 3 Lendárias) | 150 |
| ⚡ Deuses | 💎300 (garante Douradas e Lendárias, 50% Divina, 8% Secreta) | 250 |

**🃏 Cartas do Dia:** 4 ofertas de cartas avulsas que mudam todo dia (ex.: 20 cartas comuns por 🪙150).

**Fidelização:**
- 🎁 **Calendário diário (7 dias):** moedas → Baú de Madeira → gemas → Baú de Prata → moedas → Baú de Ouro → **Baú Mágico + 💎10**.
  Quem não falha nenhum dia ganha baús melhores no dia 7 das semanas seguintes (Lendário, até o dos Deuses). Mostra a sequência e o recorde.
- 🗺️ **Caminho de recompensas:** baú especial ao vencer pela 1ª vez as fases 3 (Prata), 8 (Ouro), 15 (Mágico), 25 (Lendário),
  40 (Deuses) e depois a cada 10 fases. O baú aparece no mapa em cima da fase.
- 📦 Baú grátis a cada 4 horas + baú a cada vitória.

**Prêmios variados nos baús:** cartas + moedas (com chance de vir **em DOBRO**) + chance de **gemas** e de **energia**.
Quanto melhor o baú, maior a chance (Baú de Ouro: 80% de vir gemas; Mágico, Lendário e Deuses: sempre vêm gemas).

### Monstros atacam as armas
Todas as armas têm **barra de vida** sempre visível. **Todos os monstros** atacam as armas perto do caminho
(gosma, pedra, mordida, mergulho, veneno, maldição, neve, fogo, lava...). O dano aparece em número (-12),
o monstro dá uma investida e a arma pisca. Arma sem vida é **destruída**; conserte com 🔧 pagando ouro.

O sorteio dos baús é feito **no servidor** (o app não consegue escolher as cartas).

Gemas viram: moedas (para melhorar torres), energia cheia, Torre Dragão, liberar a Maga mais cedo.
O jogador paga pelo Google Play → o Google fica com **15%** (até US$ 1 milhão/ano) → o resto cai na sua
**conta de comerciante** e é transferido para o seu banco todo mês.


## 🚀 PUBLICAR DE GRAÇA (site que instala no celular)

O jogo fica num site; no celular o jogador toca em **"Adicionar à tela inicial"** e ele vira um app.
Contas e compras ficam no **banco de dados na nuvem**, então quando você publicar no Google Play
o jogador entra na **mesma conta** (Google ou código de recuperação) e não perde nada.

**Custos:** R$ 0 para começar. O Mercado Pago cobra só uma taxa por venda.
**Limite do plano grátis:** o servidor "dorme" após 15 min sem jogadores e leva ~1 minuto para acordar
(a tela "Conectando ao reino…" aparece). Quando tiver vendas, o plano pago do Render tira isso.

### Passo 1 — Colocar o projeto no GitHub (grátis)
1. Crie uma conta em github.com → **New repository** (pode ser privado) → nome `reino-guardioes`.
2. Toque em **uploading an existing file** e envie TODO o conteúdo da pasta `guardioes`
   (sem a pasta `node_modules`).

### Passo 2 — Banco de dados grátis (Neon)
1. Crie conta em neon.com → **New project** (região mais perto: São Paulo, se houver).
2. Copie a **Connection string** (começa com `postgresql://...`). Guarde.

### Passo 3 — Pagamentos (Mercado Pago)
1. Crie/abra sua conta Mercado Pago e cadastre uma **chave PIX** na conta.
2. Em mercadopago.com.br/developers → **Suas integrações** → **Criar aplicação**
   (tipo: Pagamentos online / Checkout API).
3. Em **Credenciais de produção**, copie o **Access Token** (começa com `APP_USR-`). Guarde (é secreto!).

### Passo 4 — Login com Google (grátis)
1. console.cloud.google.com → crie um projeto → **APIs e serviços → Tela de consentimento OAuth** (Externo, preencha o nome do jogo).
2. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
3. Em **Origens JavaScript autorizadas** coloque o endereço do seu site (do passo 5, ex.: `https://reino-guardioes.onrender.com`).
4. Copie o **ID do cliente** (termina com `.apps.googleusercontent.com`).
   *(Pode fazer este passo depois do 5, quando já souber o endereço.)*

### Passo 5 — Servidor grátis (Render)
1. Crie conta em render.com (entre com o GitHub) → **New → Blueprint** → escolha o repositório.
   O arquivo `render.yaml` já configura tudo.
2. Preencha as variáveis: `DATABASE_URL` (Neon), `MP_ACCESS_TOKEN` (Mercado Pago),
   `GOOGLE_CLIENT_ID` (Google) e `PUBLIC_URL` (o endereço que o Render mostrar, ex.: `https://reino-guardioes.onrender.com`).
3. Aguarde o deploy. Abra o endereço: o jogo está no ar! 🎉
4. Teste: crie uma conta, faça uma compra de R$ 0,99 por PIX e confira se as gemas chegam.

### Como o jogador NÃO perde nada
- **👤 Conta** (na tela inicial): **Entrar com Google** ou **Criar código de recuperação** (ex.: `RG-AB12-CD34-EF56`).
- Trocou de celular, limpou o navegador ou baixou o app do Google Play? Entra com Google ou digita o código → mesma conta.
- Todas as compras (PIX, cartão, Google Play) ficam registradas na conta e no banco de dados.

### Depois: Google Play (quando tiver os US$ 25)
Siga a seção "Passo a passo para publicar" abaixo. No app, edite `client/www/js/config.js`:
`DEMO: false`, `API_URL: 'https://seu-endereco.onrender.com'`, `GOOGLE_CLIENT_ID: '...'`.
Para o login Google no app, crie também um ID de cliente OAuth do tipo **Android** (com o SHA-1 da sua chave)
e coloque os dois IDs no servidor separados por vírgula em `GOOGLE_CLIENT_ID` (o ID **Web** primeiro).
No Google Play as compras usam o pagamento do Google (regra da loja); o que foi comprado por PIX continua valendo na conta.

## Por que é difícil de hackear
- **Saldo só existe no servidor.** O celular não guarda moedas/gemas; mesmo editando o app, nada muda.
- **O servidor refaz a partida inteira.** O app envia só as jogadas ("construí torre X no tick Y"). O servidor
  roda o mesmo motor (`shared/sim.js`) e confere se a vitória é verdadeira. Ouro infinito, torre bloqueada,
  vidas infinitas → partida recusada.
- **Anti speed-hack:** a partida não pode terminar mais rápido que 2x real.
- **Compras conferidas no Google:** o servidor pergunta à API do Google Play se o pagamento existe, se é da
  mesma conta e se não foi usado antes. Reembolsos são verificados a cada 6h e as gemas são retiradas.
- **Conta suspensa** depois de 5 tentativas de trapaça.
- Testes automáticos: `cd server && npm test` (49 verificações: trapaças, compras, PIX, contas e banco de dados).

> Nenhum jogo é 100% à prova de tudo (ex.: bots que jogam sozinhos), mas o que vale dinheiro está protegido.

## Estrutura
```
shared/   motor do jogo + regras de economia (usado pelo app E pelo servidor)
server/   servidor Node.js (contas, fases, loja, verificação de pagamento)
client/   app (HTML/JS) + configuração para virar app Android (Capacitor)
tests/    robô que joga + testes anti-trapaça
```

## Passo a passo para publicar

### 1. Testar no computador
```
cd server && npm install && npm run dev
```
Abra http://localhost:8080 (sem `API_URL` em `client/www/js/config.js` ele roda em modo demonstração).

### 2. Colocar o servidor no ar
Qualquer hospedagem Node serve (Render, Railway, Fly.io, VPS). Configure as variáveis:
- `NODE_ENV=production`
- `JWT_SECRET=` um texto aleatório com 40+ caracteres
- `ANDROID_PACKAGE=com.seunome.reinodosguardioes`
- `GOOGLE_SERVICE_ACCOUNT_JSON=` conteúdo do arquivo .json da conta de serviço (passo 5)
- `DB_PATH=` caminho num **disco persistente** (senão os jogadores perdem o progresso)

Depois coloque o endereço em `client/www/js/config.js` → `API_URL: 'https://seu-servidor...'`.

### 3. Conta Google Play
1. Crie a conta de desenvolvedor em play.google.com/console (taxa única de US$ 25).
2. Em **Configurar → Perfil de pagamentos**, crie a conta de comerciante e cadastre seu banco.
3. Crie o app com o pacote `com.seunome.reinodosguardioes` (troque "seunome" aqui e em `capacitor.config.json`).

### 4. Gerar o app Android
Precisa de um computador com **Android Studio**.
```
cd client
npm install
npm run android:init     # só na primeira vez
npm run android:sync
npm run android:open     # abre no Android Studio
```
No Android Studio: **Build → Generate Signed App Bundle** → gera o `.aab` para enviar ao Play Console.
Guarde a chave de assinatura com muito cuidado.

### 5. Ligar as compras
1. Envie o `.aab` para **Teste interno** no Play Console (a loja só ativa produtos depois disso).
2. **Monetizar → Produtos → Produtos no app**: crie os 5 IDs da tabela acima, ative-os.
3. No Google Cloud, crie uma **conta de serviço**, baixe o .json e convide o e-mail dela no Play Console
   (**Usuários e permissões**) com permissão de *ver dados financeiros* e *gerenciar pedidos*.
4. Em **Configuração → Testes de licença**, adicione seu e-mail para comprar sem ser cobrado.

### 6. Publicar
Ficha da loja (ícone, prints, descrição), classificação etária, política de privacidade (obrigatória),
formulário de segurança de dados → envie para produção. Contas pessoais novas precisam de um
**teste fechado com 12 testadores por 14 dias** antes da produção.

## Ajustar o jogo
- Dificuldade, inimigos e torres: `shared/sim.js` (`TOWERS`, `ENEMIES`, `genWaves`).
- Preços, prêmios, energia, diária: `shared/sim.js` → `ECON`.
- Depois de mudar `shared/`, rode `npm run android:sync` no client e reinicie o servidor.
