Gestor de Empréstimos - MVP local

Como abrir:
- Abra o arquivo index.html no navegador.

Acessos:
- Isabella/Editora: Isabella
- Visualização: entra sem senha

O que esta versão já faz:
- Login separado para Admin e Visualização.
- Admin cria e edita clientes.
- Visualização enxerga os dados, documentos, parcelas e comprovantes, mas não edita.
- Cadastro com nome completo, indicação, data do empréstimo, valor emprestado, data de devolução, valor com juros, parcelas e frequência.
- Valores manuais, sem cálculo automático de juros.
- Frequências: mensal, quinzenal, semanal, diário e pagamento único.
- Cada parcela tem status, valor combinado, valor pago, data, observação e anexo de comprovante.
- Cada cliente tem observações importantes com histórico.
- Cada pagamento gera histórico.
- Cada cliente tem nota de 0 a 5 estrelas com motivos ao clicar/passar o mouse.
- Filtros: todos, quem pagou, devendo, em dia e sem empréstimo.
- Busca rápida global por nome, CPF, telefone, e-mail, endereço e indicação.
- Filtro por mês para lista, histórico, resumo financeiro e vencimentos.
- Avisos de vencimento: vence hoje, vence na semana e atrasado.
- Resumo financeiro: total emprestado, combinado, recebido e pendente.
- Botão WhatsApp dentro do cliente e nos avisos de cobrança.
- Backup geral em CSV e impressão/PDF.
- Mantém a marca original "Gestor de Empréstimos".
- Histórico em formato de timeline.
- Aba Documentos com arquivos ligados ao cliente.
- Exportação de ficha completa do cliente para impressão/PDF.
- Layout responsivo para desktop e celular.

Banco online simples:
- Esta versão já está preparada para usar Supabase.
- Rode o arquivo supabase-schema.sql no SQL Editor do Supabase.
- Depois abra supabase-config.js e preencha:
  - supabaseUrl
  - supabaseAnonKey
- Com isso, clientes, parcelas, histórico e documentos passam a ficar online e compartilhados entre os aparelhos.
- Enquanto esses campos estiverem com "COLE_AQUI...", o sistema usa modo local automaticamente.

Deploy Vercel:
- Suba esta pasta para o GitHub.
- Na Vercel, use esta pasta como projeto/site estático.
- O domínio grátis da Vercel funciona normalmente.

Importante para produção:
- Sem configurar Supabase, esta versão salva os dados no navegador usando localStorage.
- Com Supabase configurado, os dados ficam online e compartilhados.
- Para usar na Vercel com poucas pessoas, a senha do Admin funciona como uma trava simples, não como segurança pesada.
- Visualização entra sem senha.
