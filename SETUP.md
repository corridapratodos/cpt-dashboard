# CPT Dashboard - Setup em 3 passos

## 1. Criar app no Strava

Acesse: https://www.strava.com/settings/api

- **Application Name:** CPT Dashboard
- **Category:** Training Analysis
- **Club:** *(deixar em branco)*
- **Website:** https://dash.corridapratodos.com.br
- **Authorization Callback Domain:** dash.corridapratodos.com.br

Copie o **Client ID** e **Client Secret**.

Para registrar o webhook (apos o deploy):
```text
POST https://www.strava.com/api/v3/push_subscriptions
Content-Type: application/x-www-form-urlencoded

client_id=SEU_ID
client_secret=SEU_SECRET
callback_url=https://dash.corridapratodos.com.br/api/strava/webhook
verify_token=cpt_webhook_secret
```

---

## 2. Firebase

1. Acesse https://console.firebase.google.com -> Criar projeto -> **cpt-dash**
2. Firestore -> Criar banco -> modo producao -> regiao `southamerica-east1`
3. Configuracoes do projeto -> Contas de servico -> **Gerar nova chave privada**
   - Salve o JSON e use no env `FIREBASE_SERVICE_ACCOUNT`

Regras Firestore (Security Rules):
```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if false; // apenas server-side via Admin SDK
    }
  }
}
```

---

## 3. Vercel + variaveis de ambiente

```bash
cd dash
npm install
npx vercel
```

No painel da Vercel, configure primeiro:

- **Root Directory:** `dash`

Depois, em **Settings -> Environment Variables**, adicione:

| Variavel | Valor |
|---|---|
| `STRAVA_CLIENT_ID` | ID do app Strava |
| `STRAVA_CLIENT_SECRET` | Secret do app Strava |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | `cpt_webhook_secret` |
| `NEXTAUTH_URL` | `https://dash.corridapratodos.com.br` |
| `NEXTAUTH_SECRET` | Gerar com `openssl rand -base64 32` |
| `FIREBASE_SERVICE_ACCOUNT` | JSON inteiro da chave privada, em uma linha, sem quebras |

Arquivo de exemplo no projeto: `dash/.env.example`

### CNAME no seu DNS

No painel do dominio `corridapratodos.com.br`:
```text
Tipo: CNAME
Nome: dash
Valor: cname.vercel-dns.com
```

Depois, em **Vercel -> Domains**, adicione `dash.corridapratodos.com.br`.

---

## Fluxo apos setup

1. Usuario acessa `dash.corridapratodos.com.br`
2. Redireciona para `/login` com o botao "Entrar com Strava"
3. Strava autoriza, NextAuth cria a sessao e salva os tokens no Firestore
4. Dashboard vazio aparece com botao "Sincronizar"
5. `POST /api/strava/sync` busca o historico completo e salva no Firestore
6. Pagina recarrega com os dados
7. Novas corridas passam a chegar via webhook automaticamente
