import axios from 'axios';
import { API_ENDPOINTS } from '../apiConfig';
import type {
  Avaliacao,
  Comunicado,
  Desejo,
  Emprestimo,
  Livro,
  Suspensao,
  Usuario,
} from '../appTypes';
import { http } from './http';

type ApiErro = { erro?: string };

type DashboardData = {
  livros: Livro[];
  emprestimos: Emprestimo[];
  avaliacoes: Avaliacao[];
  desejos: Desejo[];
  usuarios: Usuario[];
  comunicados: Comunicado[];
  suspensoes: Suspensao[];
};

type CadastroUsuarioPayload = {
  nome: string;
  email: string;
  senha: string;
  perfil: 'aluno' | 'professor';
  matricula?: string;
  turma?: string;
};

type LivroPayload = {
  titulo: string;
  autor?: string;
  genero?: string;
  sinopse?: string;
  capa?: string;
  totalExemplares?: number | string;
  disponiveis?: number;
  prateleira?: string;
};

let dashboardEndpointAvailable = true;

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErro>(err)) {
    return err.response?.data?.erro || fallback;
  }
  return fallback;
}

export function logAxiosError(context: string, err: unknown) {
  if (axios.isAxiosError(err)) {
    console.error(context, err.response?.status, err.message);
    return;
  }
  console.error(context, err);
}

export function normalizarComunicado(item: Comunicado): Comunicado {
  const destinatario = item.destinatario || 'todos';
  return {
    ...item,
    destinatario,
    autor: item.autor || item.autorNome || 'Biblioteca',
  };
}

async function safeGet<T>(url: string, fallback: T): Promise<T> {
  try {
    const { data } = await http.get<T>(url);
    return data;
  } catch {
    return fallback;
  }
}

export async function carregarDadosBiblioteca(usuarioAtual?: Usuario | null): Promise<DashboardData> {
  const uid = usuarioAtual?.id;
  const query = uid ? `?usuarioId=${uid}` : '';

  if (dashboardEndpointAvailable) {
    try {
      const { data } = await http.get<DashboardData>(`/dashboard${query}`);
      return {
        livros: Array.isArray(data.livros) ? data.livros : [],
        emprestimos: Array.isArray(data.emprestimos) ? data.emprestimos : [],
        avaliacoes: Array.isArray(data.avaliacoes) ? data.avaliacoes : [],
        desejos: Array.isArray(data.desejos) ? data.desejos : [],
        usuarios: Array.isArray(data.usuarios) ? data.usuarios : [],
        comunicados: Array.isArray(data.comunicados) ? data.comunicados.map(normalizarComunicado) : [],
        suspensoes: Array.isArray(data.suspensoes) ? data.suspensoes : [],
      };
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        dashboardEndpointAvailable = false;
      } else if (axios.isAxiosError(e) && e.response) {
        // Erro HTTP com resposta (4xx/5xx) — propaga
        throw e;
      }
      // Erro de rede/cold start (sem resposta) — usa fallback individual
    }
  }

  const uidFallback = usuarioAtual?.id;
  const canViewUsers = usuarioAtual?.perfil !== 'aluno' && usuarioAtual?.perfil !== undefined;

  const [livros, emprestimos, avaliacoes, desejos, usuarios, comunicados, suspensoes] = await Promise.all([
    safeGet('/livros', [] as Livro[]),
    safeGet('/emprestimos', [] as Emprestimo[]),
    safeGet('/avaliacoes', [] as Avaliacao[]),
    uidFallback ? safeGet(`/desejos?usuarioId=${uidFallback}`, [] as Desejo[]) : Promise.resolve([] as Desejo[]),
    canViewUsers
      ? http.get<Usuario[]>('/usuarios')
          .then((res) => res.data)
          .catch((err: unknown) => {
            logAxiosError('[GET /usuarios]', err);
            return [] as Usuario[];
          })
      : Promise.resolve([] as Usuario[]),
    safeGet('/comunicados', [] as Comunicado[]),
    safeGet('/suspensoes', [] as Suspensao[]),
  ]);

  return {
    livros,
    emprestimos,
    avaliacoes,
    desejos,
    usuarios,
    comunicados: comunicados.map(normalizarComunicado),
    suspensoes,
  };
}

export async function login(email: string, senha: string) {
  const { data } = await http.post<Usuario & { token: string }>('/usuarios/login', { email, senha });
  return data;
}

export async function cadastrarUsuario(payload: CadastroUsuarioPayload) {
  const { data } = await http.post<Usuario>('/usuarios', payload);
  return data;
}

export async function verificarSuspensao(usuarioId: string) {
  const { data } = await http.get<{ bloqueado: boolean; expiraEm?: string; motivo?: string }>(
    `/suspensoes/verificar/${usuarioId}`
  );
  return data;
}

export async function reservarLivro(livroId: string) {
  await http.post('/emprestimos', { livroId });
}

export async function gerarQrRetirada(emprestimoId: string) {
  const { data } = await http.post(`/emprestimos/${emprestimoId}/qr-retirada`, {});
  return data;
}

export async function listarEmprestimos() {
  const { data } = await http.get<Emprestimo[]>('/emprestimos');
  return data;
}

export async function validarQrRetirada(codigo: string) {
  const { data } = await http.patch('/emprestimos/retirada-qr', { codigo });
  return data;
}

export async function aplicarSuspensao(payload: { usuarioId: string; emprestimoId?: string; dias: number; motivo: string }) {
  await http.post('/suspensoes', payload);
}

export async function devolverEmprestimo(emprestimoId: string) {
  await http.patch(`/emprestimos/${emprestimoId}/devolver`);
}

export async function retirarEmprestimo(emprestimoId: string) {
  await http.patch(`/emprestimos/${emprestimoId}/retirar`);
}

export async function criarLivro(payload: LivroPayload) {
  await http.post('/livros', payload);
}

export async function atualizarLivro(livroId: string, payload: LivroPayload) {
  await http.patch(`/livros/${livroId}`, payload);
}

export async function removerLivro(livroId: string) {
  await http.delete(`/livros/${livroId}`);
}

export async function renovarEmprestimo(emprestimoId: string) {
  await http.patch(`/emprestimos/${emprestimoId}/renovar`);
}

export async function enviarAvaliacao(payload: { livroId: string; nota: number; resenha: string }) {
  await http.post('/avaliacoes', payload);
}

export async function adicionarDesejo(livroId: string, usuarioId?: string) {
  const { data } = await http.post<Desejo>('/desejos', {
    livroId,
    ...(usuarioId ? { usuarioId } : {}),
  });
  return data;
}

export async function removerDesejo(desejoId: string) {
  await http.delete(`/desejos/${desejoId}`);
}

export async function solicitarRecuperacao(email: string) {
  const { data } = await http.post<{ mensagem: string; codigo?: string; aviso?: string }>(
    '/usuarios/recuperar-senha',
    { email }
  );
  return data;
}

export async function redefinirSenha(payload: { email: string; codigo: string; novaSenha: string }) {
  await http.post('/usuarios/redefinir-senha', payload);
}

export async function analisarCapa(payload: { imagemBase64: string; mediaType?: string }) {
  const { data } = await http.post<{
    titulo: string;
    autor?: string;
    genero?: string;
    sinopse?: string;
    totalExemplares?: number;
  }>(API_ENDPOINTS.scanLivro, payload);
  return data;
}

export async function excluirConta() {
  await http.delete('/usuarios/me');
}

export async function repararEmprestimos() {
  const { data } = await http.post<{ mensagem: string }>(API_ENDPOINTS.repararEmprestimos, {});
  return data;
}
