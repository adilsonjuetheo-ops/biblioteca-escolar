export type Perfil = 'aluno' | 'professor' | 'bibliotecario' | 'coordenacao';
export type Tela =
  | 'login'
  | 'cadastroAluno'
  | 'cadastroProfessor'
  | 'esqueci'
  | 'main'
  | 'professor'
  | 'bibliotecario';
export type AbaUsuario = 'home' | 'buscar' | 'historico' | 'livros' | 'avisos' | 'perfil';
export type AbaProfessor = 'home' | 'buscar' | 'reservas' | 'ranking' | 'avisos' | 'perfil';
export type AbaBiblio = 'dashboard' | 'gestao' | 'admin' | 'avisos' | 'perfil';

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  iniciais?: string;
  turma?: string;
};

export type Livro = {
  id: string;
  titulo: string;
  autor?: string;
  genero?: string;
  sinopse?: string;
  capa?: string;
  prateleira?: string;
  totalExemplares?: number;
  disponiveis: number;
};

export type Emprestimo = {
  id: string;
  usuarioId: string;
  livroId: string;
  status: 'reservado' | 'retirado' | 'devolvido' | string;
  livroTitulo?: string;
  livroAutor?: string;
  capa?: string;
  usuarioNome?: string;
  usuarioTurma?: string;
  dataReserva?: string;
  dataRetirada?: string;
  dataPrevistaDevolucao?: string;
  dataDevolucao?: string;
  renovado?: boolean;
};

export type Avaliacao = {
  id: string;
  usuarioId: string;
  livroId: string;
  nota: number;
  texto?: string;
  resenha?: string;
  usuarioNome?: string;
  criadoEm?: string;
};

export type Desejo = {
  id: string;
  usuarioId: string;
  livroId: string;
  livroTitulo?: string;
  livroAutor?: string;
  livroGenero?: string;
  livroCapa?: string;
};

export type QrRetirada = {
  codigo?: string;
  payload?: string;
  expiraEm?: string;
};

export type ScannerFeedback = {
  livro: string;
  usuario: string;
};

export type Comunicado = {
  id: string;
  titulo: string;
  mensagem: string;
  criadoEm?: string;
  tipo?: string;
  destinatario?: 'todos' | 'alunos' | 'professores' | string;
  autor?: string;
  autorNome?: string;
};

export type Suspensao = {
  id: string;
  usuarioId: string;
  motivo: string;
  expiraEm: string;
  criadoEm?: string;
};
