export const API_BASE_URL = 'https://bibliotecaapi-production-7ee0.up.railway.app';

export const API_ENDPOINTS = {
  base: API_BASE_URL,
  marlene: `${API_BASE_URL}/api/marlene`,
  scanLivro: `${API_BASE_URL}/api/scan-livro/analisar`,
  repararEmprestimos: `${API_BASE_URL}/admin/reparar-emprestimos`,
} as const;
