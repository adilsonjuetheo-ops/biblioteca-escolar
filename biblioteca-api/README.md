# Biblioteca API

API local para autenticacao e recuperacao de senha da Biblioteca Escolar.

## Recursos implementados

- Cadastro de usuarios: `POST /usuarios`
- Login: `POST /usuarios/login`
- Solicitar recuperacao: `POST /usuarios/recuperar-senha`
- Redefinir senha: `POST /usuarios/redefinir-senha`
- Leitura basica para o app: `GET /livros` e `GET /emprestimos`

## Como rodar

1. Copie `.env.example` para `.env`
2. Instale dependencias:

```bash
npm install
```

3. Inicie em desenvolvimento:

```bash
npm run dev
```

Por padrao, a API sobe em `http://localhost:3000`.

## Recuperacao de senha

### Solicitar codigo

`POST /usuarios/recuperar-senha`

Body:

```json
{
  "email": "usuario@aluno.mg.gov.br"
}
```

- Codigo de 6 digitos
- Expira em 15 minutos
- Limite de 1 solicitacao por minuto por e-mail
- Em producao, configure SMTP para envio real de e-mail
- Em desenvolvimento sem SMTP, o codigo volta na resposta para testes

### Redefinir senha

`POST /usuarios/redefinir-senha`

Body:

```json
{
  "email": "usuario@aluno.mg.gov.br",
  "codigo": "123456",
  "novaSenha": "novaSenha123"
}
```

## SMTP (opcional, recomendado em producao)

Configure no `.env`:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
