# CPT Dashboard — Setup em 3 passos

## 1. Criar app no Strava

Acesse: https://www.strava.com/settings/api

- **Application Name:** CPT Dashboard
- **Category:** Training Analysis
- **Club:** *(deixar em branco)*
- **Website:** https://dash.corridapratodos.com.br
- **Authorization Callback Domain:** dash.corridapratodos.com.br

Copie o **Client ID** e **Client Secret**.

Para registrar o webhook (após o deploy):
```
POST https://www.strava.com/api/v3/push_subscriptions
Content-Type: application/x-www-form-urlencoded

client_id=SEU_ID
client_secret=SEU_SECRET
callback_url=https://dash.corridapratodos.com.br/api/strava/webhook
verify_token=cpt_webhook_secret
```

---

## 2. Firebase

1. Acesse https://console.firebase.google.com → Criar projeto → **cpt-dash**
2. Firestore → Criar banco → modo produção → região `southamerica-east1`
3. Configurações do projeto → Contas de serviço → **Gerar nova chave privada**
   - Salva o JSON — vai no env como `FIREBASE_SERVICE_ACCOUNT`

Regras Firestore (Security Rules):
```
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

## 3. Vercel + variáveis de ambiente

```bash
cd dash
npm install
npx vercel
```

No painel Vercel → Settings → Environment Variables, adicione:

| Variável | Valor |
|---|---|
| `STRAVA_CLIENT_ID` | ID do app Strava |
| `STRAVA_CLIENT_SECRET` | Secret do app Strava |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | `cpt_webhook_secret` |
| `NEXTAUTH_URL` | `https://dash.corridapratodos.com.br` |
| `NEXTAUTH_SECRET` | Rodar: `openssl rand -base64 32` |
| `FIREBASE_SERVICE_ACCOUNT` | JSON inteiro da chave privada, em uma linha, sem quebras |

Arquivo de exemplo no projeto: `dash/.env.example`

### CNAME no seu DNS

No painel do seu domínio (corridapratodos.com.br):
```
Tipo: CNAME
Nome: dash
Valor: cname.vercel-dns.com
```

Depois no Vercel → Domains → adicionar `dash.corridapratodos.com.br`.

---

## Fluxo após setup

1. Usuário acessa `dash.corridapratodos.com.br`
2. Redireciona para `/login` → botão "Entrar com Strava"
3. Strava autoriza → NextAuth cria sessão com access_token
4. Dashboard vazio aparece com botão "Sincronizar"
5. Clica em Sincronizar → `POST /api/strava/sync` busca histórico completo e salva no Firestore
6. Página recarrega com todos os dados
7. A partir daí, novas corridas chegam via webhook automaticamente
