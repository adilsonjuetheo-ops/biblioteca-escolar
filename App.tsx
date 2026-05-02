import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import MarleneChat from './MarleneChat';
import ComunicadosList from './components/ComunicadosList';
import type {
  AbaBiblio,
  AbaProfessor,
  AbaUsuario,
  Avaliacao,
  Comunicado,
  Desejo,
  Emprestimo,
  Livro,
  Perfil,
  QrRetirada,
  ScannerFeedback,
  Suspensao,
  Tela,
  Usuario,
} from './appTypes';
import {
  adicionarDesejo,
  analisarCapa,
  aplicarSuspensao,
  cadastrarUsuario,
  carregarDadosBiblioteca,
  clearDashboardCache,
  getCachedDashboard,
  criarLivro,
  atualizarLivro,
  devolverEmprestimo,
  enviarAvaliacao,
  excluirConta,
  gerarQrRetirada,
  getApiErrorMessage,
  listarEmprestimos,
  login,
  redefinirSenha,
  removerDesejo,
  removerLivro,
  renovarEmprestimo,
  registrarPushToken,
  repararEmprestimos,
  reservarLivro,
  retirarEmprestimo,
  solicitarRecuperacao,
  validarQrRetirada,
  verificarSuspensao,
} from './services/libraryApi';
import { http, setApiAuthToken } from './services/http';

const CORES = {
  ink: '#1a1208',
  parch: '#f5efe3',
  warm: '#e8dcc8',
  amber: '#c97b2e',
  amberLt: '#f0a84a',
  sage: '#4a7c59',
  rust: '#b84c2e',
  muted: '#8a7d68',
  card: '#fdfaf4',
  border: '#d9cfbe',
};

const DOMINIO_ALUNO = '@aluno.mg.gov.br';
const DOMINIO_PROFESSOR = '@educacao.mg.gov.br';
const ESCOLA = 'E. E. Cel. Jose Venancio de Souza';
const BIBLIOTECA = 'Biblioteca Marlene de Souza Queiroz';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function calcularProgresso(emp: Emprestimo): number {
  const inicio = emp.dataRetirada ?? emp.dataReserva;
  const fim = emp.dataPrevistaDevolucao;
  if (!inicio || !fim) return 50;
  const total = new Date(fim).getTime() - new Date(inicio).getTime();
  const decorrido = Date.now() - new Date(inicio).getTime();
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((decorrido / total) * 100)));
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.parch },
  loginBox: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 10 },
  logoWrap: { alignItems: 'center', marginBottom: 8 },
  logoImg: { width: 130, height: 130 },
  loginTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', color: CORES.ink },
  loginEscola: { fontSize: 13, color: CORES.sage, textAlign: 'center', fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: CORES.border },
  dividerText: { fontSize: 11, color: CORES.muted, textTransform: 'uppercase', letterSpacing: 1 },
  erroText: { color: CORES.rust, fontSize: 13, textAlign: 'center', backgroundColor: 'rgba(184,76,46,0.08)', padding: 10, borderRadius: 10 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: CORES.border, backgroundColor: CORES.card, paddingHorizontal: 16, fontSize: 15, color: CORES.ink, marginBottom: 2 },
  senhaWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  olhoBtn: { padding: 12, backgroundColor: CORES.card, borderRadius: 12, borderWidth: 1, borderColor: CORES.border },
  btnPrimary: { height: 50, borderRadius: 12, backgroundColor: CORES.amber, alignItems: 'center', justifyContent: 'center' },
  btnSage: { height: 50, borderRadius: 12, backgroundColor: CORES.sage, alignItems: 'center', justifyContent: 'center' },
  btnAmber: { backgroundColor: CORES.amber, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  btnAmberText: { color: CORES.ink, fontSize: 12, fontWeight: '700' },
  btnPrimaryText: { color: CORES.ink, fontSize: 15, fontWeight: '700' },
  btnSecundario: { height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: CORES.amber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnSecundarioText: { color: CORES.amber, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  linkText: { color: CORES.amber, fontSize: 13, textDecorationLine: 'underline' },
  warnBox: { backgroundColor: 'rgba(201,123,46,0.08)', borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: CORES.amber },
  warnText: { color: CORES.muted, fontSize: 12, textAlign: 'center' },
  voltarBtn: { marginBottom: 20 },
  voltarText: { color: CORES.amber, fontSize: 14, fontWeight: '600' },
  paginaTitulo: { fontSize: 24, fontWeight: '700', color: CORES.ink, marginBottom: 4 },
  paginaSub: { fontSize: 13, color: CORES.muted, marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: CORES.muted, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  radioRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  radioBtn: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: CORES.border, alignItems: 'center', justifyContent: 'center', backgroundColor: CORES.card },
  radioBtnAtivo: { borderColor: CORES.sage, backgroundColor: 'rgba(74,124,89,0.08)' },
  radioText: { fontSize: 11, color: CORES.muted, fontWeight: '600' },
  radioTextAtivo: { color: CORES.sage, fontWeight: '700' },
  homeHeader: { backgroundColor: CORES.ink, padding: 20, paddingTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  homeGreeting: { fontSize: 13, color: 'rgba(245,239,227,0.6)', fontWeight: '500' },
  homeName: { fontSize: 22, fontWeight: '700', color: CORES.parch, marginTop: 2 },
  homeAvatarSmall: { width: 42, height: 42, borderRadius: 21, backgroundColor: CORES.amber, alignItems: 'center', justifyContent: 'center' },
  homeAvatarText: { fontSize: 16, fontWeight: '700', color: CORES.ink },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: CORES.muted, textTransform: 'uppercase', marginTop: 8, marginBottom: 10 },
  searchBar: { height: 44, borderRadius: 22, borderWidth: 1, borderColor: CORES.border, backgroundColor: CORES.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  searchPlaceholder: { color: CORES.muted, fontSize: 14 },
  loanCard: { backgroundColor: CORES.card, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: CORES.border, marginBottom: 10 },
  loanCover: { width: 44, height: 60, borderRadius: 7, flexShrink: 0 },
  loanInfo: { flex: 1 },
  loanTitle: { fontSize: 14, fontWeight: '700', color: CORES.ink },
  loanAuthor: { fontSize: 12, color: CORES.muted, marginTop: 2 },
  progressBar: { height: 4, backgroundColor: CORES.warm, borderRadius: 10, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: CORES.amber, borderRadius: 10 },
  badgeSmall: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  filtroBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: CORES.border, backgroundColor: CORES.card },
  filtroBtnAtivo: { backgroundColor: CORES.ink, borderColor: CORES.ink },
  filtroText: { fontSize: 13, color: CORES.muted, fontWeight: '500' },
  filtroTextAtivo: { color: CORES.parch, fontWeight: '700' },
  detalheCard: { flexDirection: 'row', gap: 16, marginBottom: 20, alignItems: 'flex-start' },
  detalheCover: { width: 80, height: 110, borderRadius: 10, flexShrink: 0 },
  detalheTitulo: { fontSize: 20, fontWeight: '700', color: CORES.ink, lineHeight: 26 },
  detalheAutor: { fontSize: 14, color: CORES.muted, marginTop: 4 },
  detalheInfoRow: { flexDirection: 'row', gap: 10 },
  detalheInfoChip: { flex: 1, backgroundColor: CORES.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: CORES.border },
  detalheInfoLabel: { fontSize: 10, color: CORES.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  detalheInfoValor: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  detalheSinopse: { fontSize: 15, color: CORES.ink, lineHeight: 24, marginTop: 6 },
  btnDetalheReserva: { height: 52, borderRadius: 14, backgroundColor: CORES.amber, alignItems: 'center', justifyContent: 'center' },
  btnDetalheReservaText: { color: CORES.ink, fontSize: 15, fontWeight: '700' },
  btnDetalheVoltar: { height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: CORES.border, alignItems: 'center', justifyContent: 'center' },
  btnDetalheVoltarText: { color: CORES.muted, fontSize: 14, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: CORES.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: CORES.border },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 10, color: CORES.muted, marginTop: 4, textAlign: 'center', fontWeight: '600' },
  emptyBox: { backgroundColor: CORES.card, borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: CORES.border },
  emptyText: { color: CORES.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  perfilTop: { backgroundColor: CORES.ink, padding: 24, paddingTop: 32 },
  perfilAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: CORES.amber, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  perfilAvatarText: { fontSize: 24, fontWeight: '700', color: CORES.ink },
  perfilName: { fontSize: 20, fontWeight: '700', color: CORES.parch },
  perfilSub: { fontSize: 12, color: 'rgba(245,239,227,0.5)', marginTop: 4 },
  perfilBadge: { backgroundColor: 'rgba(245,239,227,0.08)', borderRadius: 10, padding: 10, marginTop: 14 },
  perfilBadgeTitle: { color: CORES.amberLt, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  perfilBadgeSub: { color: 'rgba(245,239,227,0.5)', fontSize: 11, textAlign: 'center', marginTop: 2 },
  perfilStats: { flexDirection: 'row', marginTop: 16, backgroundColor: 'rgba(245,239,227,0.07)', borderRadius: 12, overflow: 'hidden' },
  perfilStat: { flex: 1, alignItems: 'center', padding: 12, borderRightWidth: 1, borderRightColor: 'rgba(245,239,227,0.08)' },
  perfilStatNum: { fontSize: 22, fontWeight: '700', color: CORES.amberLt },
  perfilStatLabel: { fontSize: 10, color: 'rgba(245,239,227,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  selosGrid: { gap: 10 },
  seloCard: { backgroundColor: CORES.card, borderRadius: 12, borderWidth: 1, borderColor: CORES.border, padding: 12 },
  seloCardLocked: { opacity: 0.72 },
  seloHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seloIcon: { fontSize: 24 },
  seloTitulo: { marginTop: 8, fontSize: 14, fontWeight: '700', color: CORES.ink },
  seloDesc: { marginTop: 2, fontSize: 12, color: CORES.muted },
  seloBarraBg: { marginTop: 10, height: 6, borderRadius: 99, backgroundColor: CORES.warm, overflow: 'hidden' },
  seloBarraFill: { height: '100%', borderRadius: 99, backgroundColor: CORES.sage },
  seloMeta: { marginTop: 6, fontSize: 11, color: CORES.muted, fontWeight: '600', textAlign: 'right' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CORES.border, gap: 12 },
  menuIcon: { width: 36, height: 36, backgroundColor: CORES.warm, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 14, fontWeight: '600', color: CORES.ink },
  menuSub: { fontSize: 12, color: CORES.muted, marginTop: 1 },
  menuArrow: { color: CORES.muted, fontSize: 20 },
  logoutBtn: { marginTop: 20, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: CORES.amber, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: CORES.amber, fontSize: 15, fontWeight: '600' },
  deleteAccountBtn: { marginTop: 12, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: CORES.rust, alignItems: 'center', justifyContent: 'center' },
  deleteAccountText: { color: CORES.rust, fontSize: 15, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: CORES.card, borderTopWidth: 1, borderTopColor: CORES.border, paddingBottom: 4 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabLabel: { fontSize: 10, color: CORES.muted, fontWeight: '500' },
  tabBadge: { position: 'absolute', top: -4, right: -6, backgroundColor: CORES.rust, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  comunicadoCard: { backgroundColor: CORES.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: CORES.border, marginBottom: 12 },
  comunicadoHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  comunicadoIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: CORES.warm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  comunicadoTitulo: { fontSize: 14, fontWeight: '700', color: CORES.ink },
  comunicadoMeta: { fontSize: 11, color: CORES.muted, marginTop: 2 },
  comunicadoMensagem: { fontSize: 14, color: CORES.ink, lineHeight: 22, marginBottom: 10 },
  comunicadoAutor: { fontSize: 11, color: CORES.muted, fontStyle: 'italic' },
  resenhaJaCard: { backgroundColor: CORES.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: CORES.border, marginTop: 4 },
  resenhaTexto: { fontSize: 14, color: CORES.ink, fontStyle: 'italic', lineHeight: 22, marginTop: 6 },
  avaliacaoCard: { backgroundColor: CORES.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: CORES.border, marginBottom: 10 },
  avaliacaoNome: { fontSize: 13, fontWeight: '700', color: CORES.ink },
  avaliacaoMediaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: CORES.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: CORES.border, marginBottom: 12 },
  avaliacaoMediaNum: { fontSize: 40, fontWeight: '700', color: CORES.amber },
  qrValidationBox: { backgroundColor: CORES.card, borderRadius: 12, borderWidth: 1, borderColor: CORES.border, padding: 12, marginBottom: 12 },
  qrCard: { backgroundColor: CORES.card, borderRadius: 14, borderWidth: 1, borderColor: CORES.border, padding: 16, alignItems: 'center' },
  qrTitle: { fontSize: 18, fontWeight: '700', color: CORES.ink, textAlign: 'center' },
  qrSub: { marginTop: 6, fontSize: 12, color: CORES.muted, textAlign: 'center' },
  qrImage: { width: 240, height: 240, marginTop: 12, borderRadius: 10, backgroundColor: '#fff' },
  qrCodeText: { marginTop: 10, fontSize: 20, letterSpacing: 2, fontWeight: '700', color: CORES.ink },
  qrExpireText: { marginTop: 8, fontSize: 12, color: CORES.muted },
  scannerHeader: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CORES.ink },
  scannerBack: { color: CORES.amberLt, fontSize: 16, fontWeight: '700' },
  scannerTitle: { color: CORES.parch, fontSize: 14, fontWeight: '700' },
  scannerFrame: { flex: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: CORES.amber, backgroundColor: '#000' },
  scannerHint: { marginTop: 12, color: CORES.muted, fontSize: 12, textAlign: 'center' },
  scannerFeedbackOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(74,124,89,0.92)',
    borderRadius: 12,
    padding: 12,
  },
  scannerFeedbackTitle: { color: CORES.parch, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  scannerFeedbackText: { color: CORES.parch, fontSize: 12, marginTop: 4, textAlign: 'center' },
});

export default function App() {
  const [tela, setTela] = useState<Tela>('login');
  const [abaAtiva, setAbaAtiva] = useState<AbaUsuario>('home');
  const [abaProfessor, setAbaProfessor] = useState<AbaProfessor>('home');
  const [abaBiblio, setAbaBiblio] = useState<AbaBiblio>('dashboard');
  const [token, setToken] = useState<string>('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [livros, setLivros] = useState<Livro[]>([]);
  const [emprestimosAtivos, setEmprestimosAtivos] = useState<Emprestimo[]>([]);
  const [historico, setHistorico] = useState<Emprestimo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [livroSelecionado, setLivroSelecionado] = useState<Livro | null>(null);
  const [buscaInput, setBuscaInput] = useState('');
  const [buscaTexto, setBuscaTexto] = useState('');
  const [filtroGenero, setFiltroGenero] = useState('todos');
  const [filtroDisp, setFiltroDisp] = useState('todos');
  const [paginaLivros, setPaginaLivros] = useState(1);
  const [paginaHome, setPaginaHome] = useState(1);
  const [paginaHomeProfessor, setPaginaHomeProfessor] = useState(1);
  const [paginaGestao, setPaginaGestao] = useState(1);
  const [paginaAdminLivros, setPaginaAdminLivros] = useState(1);
  const [paginaAdminUsuarios, setPaginaAdminUsuarios] = useState(1);

  const [todasAvaliacoes, setTodasAvaliacoes] = useState<Avaliacao[]>([]);
  const [telaResenha, setTelaResenha] = useState(false);
  const [livroParaResenhar, setLivroParaResenhar] = useState<Emprestimo | null>(null);
  const [notaResenha, setNotaResenha] = useState(0);
  const [textoResenha, setTextoResenha] = useState('');
  const [enviandoResenha, setEnviandoResenha] = useState(false);

  const [desejos, setDesejos] = useState<Desejo[]>([]);
  const [telaListaDesejos, setTelaListaDesejos] = useState(false);
  const [togglendoDesejo, setTogglendoDesejo] = useState<string | null>(null);
  const [telaHistorico, setTelaHistorico] = useState(false);
  const [telaComunicadosPerfil, setTelaComunicadosPerfil] = useState(false);

  const [cadNome, setCadNome] = useState('');
  const [cadEmail, setCadEmail] = useState('');
  const [cadSenha, setCadSenha] = useState('');
  const [cadMatricula, setCadMatricula] = useState('');
  const [cadTurma, setCadTurma] = useState('');

  const [profNome, setProfNome] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profSenha, setProfSenha] = useState('');
  const [profDisciplina, setProfDisciplina] = useState('');

  const [recEmail, setRecEmail] = useState('');
  const [recCodigo, setRecCodigo] = useState('');
  const [recNovaSenha, setRecNovaSenha] = useState('');
  const [recConfirmarSenha, setRecConfirmarSenha] = useState('');
  const [recEtapa, setRecEtapa] = useState<'email' | 'codigo'>('email');
  const [recMensagem, setRecMensagem] = useState('');
  const [recLoading, setRecLoading] = useState(false);

  const [usuariosAdmin, setUsuariosAdmin] = useState<Usuario[]>([]);
  const [emprestimosEscola, setEmprestimosEscola] = useState<Emprestimo[]>([]);
  const [livroTituloNovo, setLivroTituloNovo] = useState('');
  const [livroAutorNovo, setLivroAutorNovo] = useState('');
  const [livroGeneroNovo, setLivroGeneroNovo] = useState('');
  const [livroSinopseNovo, setLivroSinopseNovo] = useState('');
  const [livroCapaNovo, setLivroCapaNovo] = useState('');
  const [livroTotalNovo, setLivroTotalNovo] = useState('1');
  const [salvandoLivro, setSalvandoLivro] = useState(false);

  const [telaQrRetirada, setTelaQrRetirada] = useState(false);
  const [marleneAberta, setMarleneAberta] = useState(false);
  const [emprestimoQrAtual, setEmprestimoQrAtual] = useState<Emprestimo | null>(null);
  const [dadosQrRetirada, setDadosQrRetirada] = useState<QrRetirada | null>(null);
  const [gerandoQrRetirada, setGerandoQrRetirada] = useState(false);
  const [codigoQrRetirada, setCodigoQrRetirada] = useState('');
  const [validandoQrRetirada, setValidandoQrRetirada] = useState(false);
  const [telaScannerQr, setTelaScannerQr] = useState(false);
  const [scanBloqueado, setScanBloqueado] = useState(false);
  const [scannerFeedback, setScannerFeedback] = useState<ScannerFeedback | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [erroConexao, setErroConexao] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [atualizandoBg, setAtualizandoBg] = useState(false);
  const [suspensoes, setSuspensoes] = useState<Suspensao[]>([]);
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [ordemAcervo, setOrdemAcervo] = useState<'titulo' | 'autor' | 'disponiveis' | 'popular'>('titulo');
  const [comunicadosLidos, setComunicadosLidos] = useState<Set<string>>(new Set());
  const [filtroEmpTurma, setFiltroEmpTurma] = useState('todas');
  const [filtroEmpStatus, setFiltroEmpStatus] = useState('todos');

  const [agora, setAgora] = useState(Date.now());

  // ── SCAN DE CAPA ──
  const [scanandoCapa, setScanandoCapa] = useState(false);
  const [livroScaneado, setLivroScaneado] = useState<{
    titulo: string; autor?: string; genero?: string;
    sinopse?: string; totalExemplares: number; capa?: string; prateleira?: string;
  } | null>(null);
  const [salvandoScan, setSalvandoScan] = useState(false);
  const [reparando, setReparando] = useState(false);

  const saudacaoPorHorario = (() => {
    const hora = Number(
      new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(agora))
    );
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  useEffect(() => {
    const clockTimer = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    http.get('/health').catch(() => {}); // Aquece o Railway em segundo plano ao abrir o app
  }, []);

  const buscaTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setApiAuthToken(token);
  }, [token]);

  React.useEffect(() => { setPaginaLivros(1); }, [filtroGenero, filtroDisp, ordemAcervo]);
  React.useEffect(() => { setPaginaHome(1); setPaginaHomeProfessor(1); }, [livros]);

  useEffect(() => {
    if (!usuario) return;
    if (!Device.isDevice) return; // emulador não suporta push
    async function registrar() {
      const { status } = await Notifications.getPermissionsAsync();
      const statusFinal = status !== 'granted'
        ? (await Notifications.requestPermissionsAsync()).status
        : status;
      if (statusFinal !== 'granted') return;
      try {
        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
          projectId: '4e9f49b6-7367-4dc1-99a6-0d0431d1884e',
        });
        await registrarPushToken(expoPushToken);
      } catch {
        // falha silenciosa — push não é crítico
      }
    }
    registrar();
  }, [usuario?.id]);

  const _popLivros = new Map<string, number>();
  todasAvaliacoes.forEach(av => {
    _popLivros.set(av.livroId, (_popLivros.get(av.livroId) || 0) + 1);
  });
  const livrosFiltrados = livros.filter(livro => {
    const q = buscaTexto.toLowerCase();
    const textoOk = !q ||
      livro.titulo?.toLowerCase().includes(q) ||
      livro.autor?.toLowerCase().includes(q) ||
      livro.genero?.toLowerCase().includes(q);
    const generoOk = filtroGenero === 'todos' || livro.genero === filtroGenero;
    const dispOk = filtroDisp === 'todos' ||
      (filtroDisp === 'disponivel' && livro.disponiveis > 0) ||
      (filtroDisp === 'indisponivel' && livro.disponiveis === 0);
    return textoOk && generoOk && dispOk;
  }).sort((a, b) => {
    if (ordemAcervo === 'autor') return (a.autor || '').localeCompare(b.autor || '', 'pt-BR');
    if (ordemAcervo === 'disponiveis') return b.disponiveis - a.disponiveis;
    if (ordemAcervo === 'popular') return (_popLivros.get(b.id) || 0) - (_popLivros.get(a.id) || 0);
    return (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR');
  });

  const LIVROS_POR_PAGINA = 20;
  const totalPaginasLivros = Math.max(1, Math.ceil(livrosFiltrados.length / LIVROS_POR_PAGINA));
  const livrosPaginados = livrosFiltrados.slice(
    (paginaLivros - 1) * LIVROS_POR_PAGINA,
    paginaLivros * LIVROS_POR_PAGINA,
  );
  const totalPaginasHome = Math.max(1, Math.ceil(livros.length / LIVROS_POR_PAGINA));
  const livrosPaginadosHome = livros.slice(
    (paginaHome - 1) * LIVROS_POR_PAGINA,
    paginaHome * LIVROS_POR_PAGINA,
  );
  const totalPaginasHomeProfessor = Math.max(1, Math.ceil(livros.length / LIVROS_POR_PAGINA));
  const livrosPaginadosHomeProfessor = livros.slice(
    (paginaHomeProfessor - 1) * LIVROS_POR_PAGINA,
    paginaHomeProfessor * LIVROS_POR_PAGINA,
  );
  const totalPaginasGestao = Math.max(1, Math.ceil(livros.length / LIVROS_POR_PAGINA));
  const livrosPaginadosGestao = livros.slice(
    (paginaGestao - 1) * LIVROS_POR_PAGINA,
    paginaGestao * LIVROS_POR_PAGINA,
  );
  const totalPaginasAdminLivros = Math.max(1, Math.ceil(livros.length / LIVROS_POR_PAGINA));
  const livrosPaginadosAdmin = livros.slice(
    (paginaAdminLivros - 1) * LIVROS_POR_PAGINA,
    paginaAdminLivros * LIVROS_POR_PAGINA,
  );
  const totalPaginasAdminUsuarios = Math.max(1, Math.ceil(usuariosAdmin.length / LIVROS_POR_PAGINA));
  const usuariosPaginadosAdmin = usuariosAdmin.slice(
    (paginaAdminUsuarios - 1) * LIVROS_POR_PAGINA,
    paginaAdminUsuarios * LIVROS_POR_PAGINA,
  );

  function handleBuscaChange(text: string) {
    setBuscaInput(text);
    if (buscaTimerRef.current) clearTimeout(buscaTimerRef.current);
    buscaTimerRef.current = setTimeout(() => {
      setBuscaTexto(text);
      setPaginaLivros(1);
    }, 500);
  }

  const generosUnicos = ['todos', ...Array.from(new Set(livros.map(l => l.genero).filter(Boolean))) as string[]];

  function aplicarDadosCarregados(dados: { livros: Livro[]; emprestimos: Emprestimo[]; avaliacoes: Avaliacao[]; desejos: Desejo[]; usuarios: Usuario[]; comunicados: Comunicado[]; suspensoes: Suspensao[] }, usuarioAtual: Usuario | null) {
    const uid = usuarioAtual?.id;
    setLivros(Array.isArray(dados.livros) ? dados.livros : []);
    const todosEmprestimos: Emprestimo[] = Array.isArray(dados.emprestimos) ? dados.emprestimos : [];
    const perfil = usuarioAtual?.perfil;
    const isBiblio = !!perfil && perfil !== 'aluno' && perfil !== 'professor';
    const ativos = todosEmprestimos.filter(e => e.status === 'reservado' || e.status === 'retirado');
    const devolvidos = todosEmprestimos.filter(e => e.status === 'devolvido');
    const isProf = perfil === 'professor';
    setEmprestimosAtivos(isBiblio ? ativos : ativos.filter(e => e.usuarioId === uid));
    setHistorico(isBiblio ? devolvidos : devolvidos.filter(e => e.usuarioId === uid));
    if (isBiblio || isProf) setEmprestimosEscola(todosEmprestimos);
    setTodasAvaliacoes(Array.isArray(dados.avaliacoes) ? dados.avaliacoes : []);
    setDesejos(Array.isArray(dados.desejos) ? dados.desejos : []);
    setUsuariosAdmin(Array.isArray(dados.usuarios) ? dados.usuarios : []);
    setComunicados(Array.isArray(dados.comunicados) ? dados.comunicados : []);
    setSuspensoes(Array.isArray(dados.suspensoes) ? dados.suspensoes : []);
  }

  async function carregarDados(usuarioAtual = usuario, opts: { pull?: boolean } = {}) {
    const { pull = false } = opts;
    const uid = usuarioAtual?.id;
    const cached = uid ? getCachedDashboard(uid) : null;

    if (cached && !pull) {
      // Mostra cache imediatamente e atualiza em segundo plano
      aplicarDadosCarregados(cached, usuarioAtual);
      setErroConexao(false);
      setAtualizandoBg(true);
      try {
        const fresh = await carregarDadosBiblioteca(usuarioAtual);
        aplicarDadosCarregados(fresh, usuarioAtual);
      } catch {
        // Mantém os dados do cache visíveis
      } finally {
        setAtualizandoBg(false);
      }
      return;
    }

    if (pull) setRefreshing(true);
    else { setCarregando(true); setErroConexao(false); }

    try {
      const dados = await carregarDadosBiblioteca(usuarioAtual);
      aplicarDadosCarregados(dados, usuarioAtual);
      setErroConexao(false);
    } catch {
      if (!pull) setErroConexao(true);
    } finally {
      setCarregando(false);
      setRefreshing(false);
    }
  }

  async function handleLogin() {
    setErro('');
    if (!email || !senha) { setErro('Preencha todos os campos.'); return; }
    const emailLower = email.toLowerCase();
    if (!emailLower.endsWith(DOMINIO_ALUNO) && !emailLower.endsWith(DOMINIO_PROFESSOR)) {
      setErro('Use seu e-mail escolar institucional'); return;
    }
    setLoading(true);
    try {
      const data = await login(email.trim(), senha.trim());
      const iniciais = data.nome.split(' ').map((p: string) => p[0].toUpperCase()).join('').slice(0, 2);
      const usuarioLogado = { ...data, iniciais };
      setUsuario(usuarioLogado);
      setToken(data.token);
      setApiAuthToken(data.token);
      if (data.perfil === 'aluno') {
        setTela('main'); setAbaAtiva('home');
      } else if (data.perfil === 'professor') {
        setTela('professor'); setAbaProfessor('home');
      } else {
        setTela('bibliotecario'); setAbaBiblio('dashboard');
      }
      await carregarDados(usuarioLogado);
    } catch (err: unknown) {
      setErro(getApiErrorMessage(err, 'E-mail ou senha incorretos'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCadastroAluno() {
    if (!cadNome || !cadEmail || !cadSenha || !cadMatricula || !cadTurma) {
      Alert.alert('Atenção', 'Preencha todos os campos.'); return;
    }
    if (!cadEmail.toLowerCase().endsWith(DOMINIO_ALUNO)) {
      Alert.alert('E-mail inválido', `Use ${DOMINIO_ALUNO}`); return;
    }
    if (cadSenha.length < 6) {
      Alert.alert('Senha fraca', 'Mínimo 6 caracteres.'); return;
    }
    try {
      const data = await cadastrarUsuario({
        nome: cadNome.trim(), email: cadEmail.trim(), senha: cadSenha.trim(),
        matricula: cadMatricula.trim(), turma: cadTurma.trim(), perfil: 'aluno',
      });
      const emailCadastrado = cadEmail.toLowerCase().trim();
      Alert.alert('Cadastro realizado!', `Bem-vindo(a), ${data.nome}! Agora entre com seu e-mail e senha.`, [
        { text: 'Fazer login', onPress: () => {
          setEmail(emailCadastrado); // pré-preenche o campo de e-mail no login
          setSenha('');
          setTela('login');
          setCadNome(''); setCadEmail(''); setCadSenha('');
          setCadMatricula(''); setCadTurma('');
        }}
      ]);
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível cadastrar.'));
    }
  }

  async function handleCadastroProfessor() {
    if (!profNome || !profEmail || !profSenha || !profDisciplina) {
      Alert.alert('Atenção', 'Preencha todos os campos.'); return;
    }
    if (!profEmail.toLowerCase().endsWith(DOMINIO_PROFESSOR)) {
      Alert.alert('E-mail inválido', `Use ${DOMINIO_PROFESSOR}`); return;
    }
    if (profSenha.length < 6) {
      Alert.alert('Senha fraca', 'Mínimo 6 caracteres.'); return;
    }
    try {
      const data = await cadastrarUsuario({
        nome: profNome.trim(), email: profEmail.trim(), senha: profSenha.trim(),
        matricula: profDisciplina, perfil: 'professor',
      });
      const emailProf = profEmail.toLowerCase().trim();
      Alert.alert('Cadastro realizado!', `Professor(a) ${data.nome} cadastrado(a)! Agora entre com seu e-mail e senha.`, [
        { text: 'Fazer login', onPress: () => {
          setEmail(emailProf); // pré-preenche o campo de e-mail no login
          setSenha('');
          setTela('login');
          setProfNome(''); setProfEmail(''); setProfSenha('');
          setProfDisciplina('');
        }}
      ]);
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível cadastrar.'));
    }
  }

  async function handleReserva(livro: Livro) {
    if (!usuario) return;
    try {
      const data = await verificarSuspensao(usuario.id);
      if (data.bloqueado) {
        const expira = new Date(data.expiraEm).toLocaleDateString('pt-BR');
        Alert.alert(
          '🚫 Conta bloqueada',
          `Você está bloqueado até ${expira}.\nMotivo: ${data.motivo || 'Devolução em atraso'}`,
        );
        return;
      }
    } catch {
      // Se a verificação falhar, permite continuar
    }
    if (livro.disponiveis === 0) {
      Alert.alert('Indisponível', 'Sem exemplares disponíveis.'); return;
    }
    try {
      await reservarLivro(livro.id);
      Alert.alert('Reserva confirmada!', `"${livro.titulo}" reservado!`);
      await carregarDados();
      setLivroSelecionado(null);
    } catch {
      Alert.alert('Erro', 'Não foi possível reservar.');
    }
  }

  // Ref para guardar o intervalo do polling do QR — permite cancelar ao apertar Voltar
  const intervaloQrRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutQrRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelarPollingQr() {
    if (intervaloQrRef.current) { clearInterval(intervaloQrRef.current); intervaloQrRef.current = null; }
    if (timeoutQrRef.current) { clearTimeout(timeoutQrRef.current); timeoutQrRef.current = null; }
  }

  async function handleGerarQrRetirada(emp: Emprestimo) {
    setGerandoQrRetirada(true);
    try {
      const data = await gerarQrRetirada(emp.id);
      setEmprestimoQrAtual(emp);
      setDadosQrRetirada(data);
      setTelaQrRetirada(true);
      await carregarDados();

      // Cancela qualquer polling anterior
      cancelarPollingQr();

      intervaloQrRef.current = setInterval(async () => {
        try {
          const empAtualizado = await listarEmprestimos();
          const empEncontrado = empAtualizado.find((e: Emprestimo) => e.id === emp.id);
          if (empEncontrado?.status === 'retirado') {
            cancelarPollingQr();
            setTelaQrRetirada(false);
            setEmprestimoQrAtual(null);
            setDadosQrRetirada(null);
            Alert.alert('✅ Retirada confirmada!', `"${emp.livroTitulo}" foi retirado com sucesso!`);
            await carregarDados();
          }
        } catch {
          cancelarPollingQr();
        }
      }, 3000);

      // Timeout de 5 minutos
      timeoutQrRef.current = setTimeout(() => cancelarPollingQr(), 300000);

    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível gerar QR de retirada.'));
    } finally {
      setGerandoQrRetirada(false);
    }
  }

  async function validarRetiradaPorQr(codigoEntrada: string, exibirAlertas = true) {
    // O QR pode conter o payload completo "BIBLIO:7:BB300A44" ou só o código "BB300A44"
    let codigo = codigoEntrada.trim();
    if (codigo.startsWith('BIBLIO:')) {
      const partes = codigo.split(':');
      codigo = partes[partes.length - 1]; // pega só o código final
    }
    if (!codigo) return null;
    setValidandoQrRetirada(true);
    try {
      const data = await validarQrRetirada(codigo);
      setCodigoQrRetirada('');
      if (exibirAlertas) {
        Alert.alert('Retirada confirmada!', 'Empréstimo atualizado como retirado.');
      }
      await carregarDados();
      return data?.emprestimo || null;
    } catch (err: unknown) {
      if (exibirAlertas) {
        Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível validar QR.'));
      }
      return null;
    } finally {
      setValidandoQrRetirada(false);
    }
  }

  async function handleValidarQrRetirada() {
    const emprestimo = await validarRetiradaPorQr(codigoQrRetirada, true);
    if (!emprestimo && !codigoQrRetirada.trim()) {
      Alert.alert('Atenção', 'Informe o código do QR para validar.');
    }
  }

  async function handleAbrirScannerQr() {
    if (!cameraPermission?.granted) {
      const resposta = await requestCameraPermission();
      if (!resposta.granted) {
        Alert.alert('Permissão necessária', 'Ative a câmera para ler o QR de retirada.');
        return;
      }
    }
    scanBloqueadoRef.current = false;
    setScanBloqueado(false);
    setScannerFeedback(null);
    setTelaScannerQr(true);
  }

  // Ref para bloqueio imediato do scanner — evita múltiplos scans simultâneos
  const scanBloqueadoRef = React.useRef(false);

  async function handleQrScaneado(data: string) {
    if (scanBloqueadoRef.current) return;
    scanBloqueadoRef.current = true;
    setScanBloqueado(true);
    const emprestimo = await validarRetiradaPorQr(data, false);
    if (emprestimo) {
      setScannerFeedback({
        livro: emprestimo.livroTitulo || `Livro #${emprestimo.livroId}`,
        usuario: emprestimo.usuarioNome || `Usuario #${emprestimo.usuarioId}`,
      });
      setTimeout(() => {
        setTelaScannerQr(false);
        setScannerFeedback(null);
        scanBloqueadoRef.current = false;
        setScanBloqueado(false);
      }, 1200);
    } else {
      Alert.alert('Erro', 'QR invalido, expirado ou ja utilizado.');
      scanBloqueadoRef.current = false;
      setScanBloqueado(false);
    }
  }

  async function handleAplicarSuspensao(emp: Emprestimo, dias: number, motivo: string) {
    try {
      await aplicarSuspensao({
        usuarioId: emp.usuarioId,
        emprestimoId: emp.id,
        dias,
        motivo,
      });
      Alert.alert('Bloqueio aplicado!', `Aluno bloqueado por ${dias} dia(s).`);
      await carregarDados();
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível aplicar o bloqueio.'));
    }
  }

  async function handleDevolucao(emp: Emprestimo) {
    try {
      await devolverEmprestimo(emp.id);
      Alert.alert('Devolução registrada!', 'Livro devolvido com sucesso.');
      await carregarDados();
    } catch {
      Alert.alert('Erro', 'Não foi possível registrar devolução.');
    }
  }

  async function handleMarcarRetirada(emp: Emprestimo) {
    try {
      await retirarEmprestimo(emp.id);
      Alert.alert('Retirada confirmada!', 'O empréstimo foi marcado como retirado.');
      await carregarDados();
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível marcar retirada.'));
    }
  }

  async function handleCriarLivro() {
    if (!livroTituloNovo.trim()) {
      Alert.alert('Atenção', 'Informe pelo menos o título do livro.');
      return;
    }
    setSalvandoLivro(true);
    try {
      await criarLivro({
        titulo: livroTituloNovo.trim(),
        autor: livroAutorNovo.trim(),
        genero: livroGeneroNovo.trim(),
        sinopse: livroSinopseNovo.trim(),
        capa: livroCapaNovo.trim(),
        totalExemplares: Number(livroTotalNovo) || 1,
      });
      setLivroTituloNovo('');
      setLivroAutorNovo('');
      setLivroGeneroNovo('');
      setLivroSinopseNovo('');
      setLivroCapaNovo('');
      setLivroTotalNovo('1');
      Alert.alert('Livro cadastrado!', 'O item foi adicionado ao acervo.');
      await carregarDados();
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível cadastrar livro.'));
    } finally {
      setSalvandoLivro(false);
    }
  }

  async function handleAjustarEstoque(livro: Livro, delta: number) {
    const totalAtual = Number(livro.totalExemplares || 0);
    const disponiveisAtuais = Number(livro.disponiveis || 0);
    const emprestados = Math.max(0, totalAtual - disponiveisAtuais);
    const novoTotal = Math.max(0, totalAtual + delta);
    if (novoTotal < emprestados) {
      Alert.alert('Operação inválida', 'Não é possível reduzir abaixo da quantidade emprestada.');
      return;
    }
    const novoDisponivel = Math.max(0, novoTotal - emprestados);
    try {
      await atualizarLivro(livro.id, {
        titulo: livro.titulo,
        autor: livro.autor,
        genero: livro.genero,
        sinopse: livro.sinopse,
        capa: livro.capa,
        totalExemplares: novoTotal,
        disponiveis: novoDisponivel,
        prateleira: livro.prateleira,
      });
      await carregarDados();
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível atualizar estoque.'));
    }
  }

  async function handleRemoverLivro(livro: Livro) {
    Alert.alert(
      'Remover livro',
      `Deseja remover "${livro.titulo}" do acervo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await removerLivro(livro.id);
              await carregarDados();
            } catch (err: unknown) {
              Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível remover livro.'));
            }
          },
        },
      ]
    );
  }

  async function handleRenovar(emp: Emprestimo) {
    Alert.alert(
      'Renovar empréstimo',
      `Deseja renovar "${emp.livroTitulo}"? O prazo será estendido por mais 5 dias.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Renovar',
          onPress: async () => {
            try {
              await renovarEmprestimo(emp.id);
              Alert.alert('Renovado!', 'Prazo estendido por mais 5 dias.');
              await carregarDados();
            } catch (err: unknown) {
              Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível renovar.'));
            }
          }
        }
      ]
    );
  }

  async function handleEnviarResenha() {
    if (notaResenha === 0) {
      Alert.alert('Atenção', 'Selecione pelo menos uma estrela.'); return;
    }
    setEnviandoResenha(true);
    try {
      await enviarAvaliacao({
        livroId: livroParaResenhar?.livroId,
        nota: notaResenha,
        resenha: textoResenha,
      });
      Alert.alert('Avaliação enviada!', 'Obrigado por compartilhar sua opinião!', [
        { text: 'OK', onPress: async () => {
          setTelaResenha(false);
          setLivroParaResenhar(null);
          setNotaResenha(0);
          setTextoResenha('');
          await carregarDados();
        }}
      ]);
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível enviar a avaliação.'));
    } finally {
      setEnviandoResenha(false);
    }
  }

  async function handleToggleDesejo(livro: { id: string }) {
    const existente = desejos.find(d => d.livroId === livro.id);
    const livroAtual = livros.find(l => l.id === livro.id);
    setTogglendoDesejo(livro.id);
    try {
      if (existente) {
        await removerDesejo(existente.id);
        setDesejos(prev => prev.filter(d => d.id !== existente.id));
      } else {
        const data = await adicionarDesejo(livro.id, usuario?.id);
        setDesejos(prev => [...prev, {
          ...data,
          livroTitulo: data.livroTitulo || livroAtual?.titulo,
          livroAutor: data.livroAutor || livroAtual?.autor,
          livroGenero: data.livroGenero || livroAtual?.genero,
          livroCapa: data.livroCapa || livroAtual?.capa,
        }]);
      }
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível atualizar a lista de desejos.'));
    } finally {
      setTogglendoDesejo(null);
    }
  }

  function resetarFluxoRecuperacao() {
    setRecCodigo('');
    setRecNovaSenha('');
    setRecConfirmarSenha('');
    setRecMensagem('');
    setRecEtapa('email');
    setRecLoading(false);
  }

  async function handleSolicitarRecuperacao() {
    const emailNormalizado = recEmail.trim().toLowerCase();
    if (!emailNormalizado) {
      setRecMensagem('Informe seu e-mail escolar para continuar.');
      return;
    }
    if (!emailNormalizado.endsWith(DOMINIO_ALUNO) && !emailNormalizado.endsWith(DOMINIO_PROFESSOR)) {
      setRecMensagem('Use seu e-mail escolar institucional.');
      return;
    }
    setRecLoading(true);
    setRecMensagem('');
    try {
      const data = await solicitarRecuperacao(emailNormalizado);
      setRecEtapa('codigo');
      setRecMensagem(data?.mensagem || 'Código enviado. Confira seu e-mail institucional.');
      if (data?.codigo) {
        Alert.alert('Código de recuperação (teste)', `Use o código: ${data.codigo}`);
      }
    } catch (err: unknown) {
      setRecMensagem(getApiErrorMessage(err, 'Não foi possível enviar o código de recuperação.'));
    } finally {
      setRecLoading(false);
    }
  }

  async function handleRedefinirSenha() {
    const emailNormalizado = recEmail.trim().toLowerCase();
    if (!emailNormalizado || !recCodigo.trim() || !recNovaSenha || !recConfirmarSenha) {
      setRecMensagem('Preencha todos os campos para redefinir a senha.');
      return;
    }
    if (recNovaSenha.length < 6) {
      setRecMensagem('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (recNovaSenha !== recConfirmarSenha) {
      setRecMensagem('A confirmação da senha não confere.');
      return;
    }
    setRecLoading(true);
    setRecMensagem('');
    try {
      await redefinirSenha({
        email: emailNormalizado,
        codigo: recCodigo.trim(),
        novaSenha: recNovaSenha,
      });
      Alert.alert('Senha redefinida', 'Sua senha foi atualizada com sucesso.', [
        {
          text: 'Ir para login',
          onPress: () => {
            resetarFluxoRecuperacao();
            setTela('login');
            setEmail(emailNormalizado);
            setSenha('');
            setErro('');
          },
        },
      ]);
    } catch (err: unknown) {
      setRecMensagem(getApiErrorMessage(err, 'Não foi possível redefinir a senha.'));
    } finally {
      setRecLoading(false);
    }
  }

  // ── SCAN DE CAPA ──
  async function handleScanCapa() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Ative a câmera para escanear capas.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setScanandoCapa(true);
    setLivroScaneado(null);

    try {
      const data = await analisarCapa({
        imagemBase64: result.assets[0].base64,
        mediaType: result.assets[0].mimeType || 'image/jpeg',
      });
      setLivroScaneado({ ...data, totalExemplares: data.totalExemplares || 1 });
    } catch (err: unknown) {
      Alert.alert('Erro ao escanear', getApiErrorMessage(err, 'Não foi possível identificar o livro.'));
    } finally {
      setScanandoCapa(false);
    }
  }

  async function handleSalvarLivroScaneado() {
    if (!livroScaneado) return;
    setSalvandoScan(true);
    try {
      await criarLivro(livroScaneado);
      Alert.alert('✅ Livro cadastrado!', `"${livroScaneado.titulo}" foi adicionado ao acervo.`);
      setLivroScaneado(null);
      await carregarDados();
    } catch (err: unknown) {
      Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível cadastrar.'));
    } finally {
      setSalvandoScan(false);
    }
  }

  function handleExcluirConta() {
    Alert.alert(
      'Excluir conta',
      'Tem certeza? Todos os seus dados serão apagados permanentemente: histórico, reservas e lista de desejos. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir definitivamente', style: 'destructive', onPress: () => {
          Alert.alert(
            'Confirmar exclusão',
            'Esta é sua última chance. Ao confirmar, sua conta será excluída permanentemente.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Sim, excluir minha conta', style: 'destructive', onPress: async () => {
                try {
                  await excluirConta();
                } catch (_) {}
                setToken('');
                setApiAuthToken(null);
                setTelaHistorico(false);
                setTelaComunicadosPerfil(false);
                setTela('login'); setEmail(''); setSenha(''); setErro('');
                setLivros([]); setEmprestimosAtivos([]); setHistorico([]);
                setDesejos([]);
              }},
            ]
          );
        }},
      ]
    );
  }

  function handleLogout() {
    Alert.alert('Sair', 'Deseja sair da conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => {
        clearDashboardCache();
        setToken('');
        setApiAuthToken(null);
        setTelaHistorico(false);
        setTelaComunicadosPerfil(false);
        setTela('login'); setEmail(''); setSenha(''); setErro('');
        setLivros([]); setEmprestimosAtivos([]); setHistorico([]);
        setTodasAvaliacoes([]); setTelaResenha(false); setLivroParaResenhar(null);
        setTelaQrRetirada(false); setEmprestimoQrAtual(null); setDadosQrRetirada(null); setCodigoQrRetirada('');
        setTelaScannerQr(false); setScanBloqueado(false); setScannerFeedback(null);
        setDesejos([]); setTelaListaDesejos(false);
        setUsuariosAdmin([]);
        setSuspensoes([]);
        setUsuario(null);
      }}
    ]);
  }

  // ── LOGIN ──
  if (tela === 'login') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.loginBox} keyboardShouldPersistTaps="handled">
          <View style={s.logoWrap}>
            <Image source={require('./assets/logo.png')} style={s.logoImg} resizeMode="contain" />
          </View>
          <Text style={s.loginTitle}>{BIBLIOTECA}</Text>
          <Text style={s.loginEscola}>{ESCOLA}</Text>
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>acesse sua conta</Text>
            <View style={s.dividerLine} />
          </View>
          {erro ? <Text style={s.erroText}>{erro}</Text> : null}
          <TextInput style={s.input} placeholder="E-mail escolar"
            placeholderTextColor={CORES.muted}
            value={email} onChangeText={setEmail}
            keyboardType="email-address" autoCapitalize="none" />
          <View style={s.senhaWrap}>
            <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Senha" placeholderTextColor={CORES.muted}
              value={senha} onChangeText={setSenha}
              secureTextEntry={!mostrarSenha}
              autoComplete="current-password" textContentType="password" />
            <TouchableOpacity style={s.olhoBtn} onPress={() => setMostrarSenha(!mostrarSenha)}>
              <Text style={{ fontSize: 16 }}>{mostrarSenha ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[s.btnPrimary, loading && { opacity: 0.7 }]}
            onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={CORES.ink} /> : <Text style={s.btnPrimaryText}>Entrar</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setRecEmail(email.trim().toLowerCase());
              resetarFluxoRecuperacao();
              setTela('esqueci');
            }}
            style={{ alignItems: 'center', marginTop: 8 }}>
            <Text style={s.linkText}>Esqueci minha senha</Text>
          </TouchableOpacity>
          <View style={[s.dividerRow, { marginTop: 20 }]}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>primeiro acesso?</Text>
            <View style={s.dividerLine} />
          </View>
          <TouchableOpacity style={s.btnSecundario} onPress={() => setTela('cadastroAluno')}>
            <Text style={s.btnSecundarioText}>🎒  Cadastro de aluno</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnSecundario, { borderColor: CORES.sage }]}
            onPress={() => setTela('cadastroProfessor')}>
            <Text style={[s.btnSecundarioText, { color: CORES.sage }]}>📖  Cadastro de professor</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  if (tela === 'esqueci') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.loginBox} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => {
              resetarFluxoRecuperacao();
              setTela('login');
            }}
            style={s.voltarBtn}>
            <Text style={s.voltarText}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>🔒</Text>
          <Text style={s.loginTitle}>Recuperar senha</Text>
          <Text style={[s.loginEscola, { marginBottom: 20 }]}>Fluxo seguro em duas etapas</Text>
          {recEtapa === 'email' ? (
            <>
              <TextInput
                style={s.input}
                placeholder="E-mail escolar"
                placeholderTextColor={CORES.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={recEmail}
                onChangeText={setRecEmail}
              />
              <TouchableOpacity
                style={[s.btnPrimary, recLoading && { opacity: 0.7 }]}
                onPress={handleSolicitarRecuperacao}
                disabled={recLoading}>
                {recLoading ? (
                  <ActivityIndicator color={CORES.ink} />
                ) : (
                  <Text style={s.btnPrimaryText}>Enviar código de recuperação</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={s.input}
                placeholder="Código recebido"
                placeholderTextColor={CORES.muted}
                value={recCodigo}
                onChangeText={setRecCodigo}
                autoCapitalize="characters"
              />
              <TextInput
                style={s.input}
                placeholder="Nova senha"
                placeholderTextColor={CORES.muted}
                value={recNovaSenha}
                onChangeText={setRecNovaSenha}
                secureTextEntry
              />
              <TextInput
                style={s.input}
                placeholder="Confirmar nova senha"
                placeholderTextColor={CORES.muted}
                value={recConfirmarSenha}
                onChangeText={setRecConfirmarSenha}
                secureTextEntry
              />
              <TouchableOpacity
                style={[s.btnPrimary, recLoading && { opacity: 0.7 }]}
                onPress={handleRedefinirSenha}
                disabled={recLoading}>
                {recLoading ? (
                  <ActivityIndicator color={CORES.ink} />
                ) : (
                  <Text style={s.btnPrimaryText}>Redefinir senha</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSolicitarRecuperacao}
                disabled={recLoading}
                style={{ alignItems: 'center', marginTop: 8 }}>
                <Text style={s.linkText}>Reenviar código</Text>
              </TouchableOpacity>
            </>
          )}
          {recMensagem ? (
            <Text style={[s.erroText, { color: CORES.ink, backgroundColor: 'rgba(74,124,89,0.14)' }]}>
              {recMensagem}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  if (tela === 'cadastroAluno') {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
          <TouchableOpacity onPress={() => setTela('login')} style={s.voltarBtn}>
            <Text style={s.voltarText}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={s.paginaTitulo}>Novo cadastro</Text>
          <Text style={s.paginaSub}>🎒 Aluno · {DOMINIO_ALUNO}</Text>
          <Text style={s.label}>Nome completo *</Text>
          <TextInput style={s.input} placeholder="Seu nome completo"
            placeholderTextColor={CORES.muted}
            value={cadNome} onChangeText={setCadNome} autoCapitalize="words" />
          <Text style={s.label}>E-mail escolar *</Text>
          <TextInput style={s.input} placeholder={`nome${DOMINIO_ALUNO}`}
            placeholderTextColor={CORES.muted}
            value={cadEmail} onChangeText={setCadEmail}
            keyboardType="email-address" autoCapitalize="none" />
          <Text style={s.label}>Matrícula *</Text>
          <TextInput style={s.input} placeholder="Número de matrícula"
            placeholderTextColor={CORES.muted}
            value={cadMatricula} onChangeText={setCadMatricula} keyboardType="numeric" />
          <Text style={s.label}>Turma *</Text>
          <TextInput style={s.input} placeholder="Ex: 3A, 2B, 1C"
            placeholderTextColor={CORES.muted}
            value={cadTurma} onChangeText={setCadTurma} autoCapitalize="characters" />
          <Text style={s.label}>Senha *</Text>
          <TextInput style={s.input} placeholder="Mínimo 6 caracteres"
            placeholderTextColor={CORES.muted}
            value={cadSenha} onChangeText={setCadSenha}
            secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          <TouchableOpacity style={[s.btnPrimary, { marginTop: 8 }]} onPress={handleCadastroAluno}>
            <Text style={s.btnPrimaryText}>Criar conta</Text>
          </TouchableOpacity>
          <View style={s.warnBox}>
            <Text style={s.warnText}>Apenas e-mails {DOMINIO_ALUNO} são aceitos</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (tela === 'cadastroProfessor') {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
          <TouchableOpacity onPress={() => setTela('login')} style={s.voltarBtn}>
            <Text style={s.voltarText}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={s.paginaTitulo}>Cadastro de professor</Text>
          <Text style={s.paginaSub}>📖 Professores · {DOMINIO_PROFESSOR}</Text>
          <Text style={s.label}>Nome completo *</Text>
          <TextInput style={s.input} placeholder="Seu nome completo"
            placeholderTextColor={CORES.muted}
            value={profNome} onChangeText={setProfNome} autoCapitalize="words" />
          <Text style={s.label}>E-mail institucional *</Text>
          <TextInput style={s.input} placeholder={`nome${DOMINIO_PROFESSOR}`}
            placeholderTextColor={CORES.muted}
            value={profEmail} onChangeText={setProfEmail}
            keyboardType="email-address" autoCapitalize="none" />
          <Text style={s.label}>Disciplina *</Text>
          <TextInput style={s.input} placeholder="Ex: Português, Matemática, História"
            placeholderTextColor={CORES.muted}
            value={profDisciplina} onChangeText={setProfDisciplina} autoCapitalize="words" />
          <Text style={s.label}>Senha *</Text>
          <TextInput style={s.input} placeholder="Mínimo 6 caracteres"
            placeholderTextColor={CORES.muted}
            value={profSenha} onChangeText={setProfSenha} secureTextEntry />
          <TouchableOpacity style={[s.btnSage, { marginTop: 8 }]} onPress={handleCadastroProfessor}>
            <Text style={s.btnPrimaryText}>Criar conta</Text>
          </TouchableOpacity>
          <View style={[s.warnBox, { borderLeftColor: CORES.sage }]}>
            <Text style={s.warnText}>Apenas e-mails {DOMINIO_PROFESSOR} são aceitos</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── RENDERS COMPARTILHADOS (usados por aluno, professor e bibliotecário) ──

  const renderNotificacoes = () => (
    <ComunicadosList
      comunicados={comunicados}
      carregando={carregando}
      titulo="Avisos e comunicados"
      subtitulo={`${comunicados.length} mensagens`}
      showAudienceBadge
    />
  );

  // ── RENDERS DO ALUNO ──

  function renderDetalhe() {
    return (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.homeHeader}>
          <TouchableOpacity onPress={() => setLivroSelecionado(null)} style={{ marginRight: 12 }}>
            <Text style={{ color: CORES.amberLt, fontSize: 16, fontWeight: '700' }}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={[s.homeGreeting, { flex: 1 }]}>Detalhes do livro</Text>
          {(() => {
            const noDesejo = desejos.find(d => d.livroId === livroSelecionado?.id);
            const carregandoDesejo = togglendoDesejo === livroSelecionado?.id;
            return (
              <TouchableOpacity
                onPress={() => livroSelecionado && handleToggleDesejo(livroSelecionado)}
                disabled={carregandoDesejo}
                style={{ padding: 4 }}>
                <Text style={{ fontSize: 24, opacity: carregandoDesejo ? 0.4 : 1 }}>
                  {noDesejo ? '❤️' : '🤍'}
                </Text>
                <Text style={{ fontSize: 9, color: noDesejo ? CORES.amberLt : 'rgba(245,239,227,0.4)', textAlign: 'center' }}>
                  {noDesejo ? 'Salvo' : 'Salvar'}
                </Text>
              </TouchableOpacity>
            );
          })()}
        </View>
        <View style={{ padding: 20 }}>
          <View style={s.detalheCard}>
            {livroSelecionado?.capa ? (
              <Image source={{ uri: livroSelecionado.capa }} style={s.detalheCover} resizeMode="cover" />
            ) : (
              <View style={[s.detalheCover, { backgroundColor: CORES.ink }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.detalheTitulo}>{livroSelecionado?.titulo}</Text>
              <Text style={s.detalheAutor}>{livroSelecionado?.autor}</Text>
              {livroSelecionado?.genero ? (
                <View style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)', marginTop: 8 }]}>
                  <Text style={[s.badgeText, { color: CORES.amber }]}>{livroSelecionado.genero}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={s.detalheInfoRow}>
            {[
              { label: 'Exemplares', valor: livroSelecionado?.totalExemplares || 1 },
              { label: 'Disponíveis', valor: livroSelecionado?.disponiveis || 0 },
              { label: 'Prazo', valor: '8 dias' },
            ].map((info, i) => (
              <View key={i} style={s.detalheInfoChip}>
                <Text style={s.detalheInfoLabel}>{info.label}</Text>
                <Text style={[s.detalheInfoValor, {
                  color: info.label === 'Disponíveis'
                    ? (livroSelecionado?.disponiveis > 0 ? CORES.sage : CORES.rust)
                    : CORES.ink
                }]}>{info.valor}</Text>
              </View>
            ))}
          </View>

          {livroSelecionado?.sinopse ? (
            <View style={{ marginTop: 20 }}>
              <Text style={s.sectionLabel}>SINOPSE</Text>
              <Text style={s.detalheSinopse}>{livroSelecionado.sinopse}</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 24, gap: 12 }}>
            {(() => {
              const jaEmprestado = emprestimosAtivos.some(
                e => e.livroId === livroSelecionado?.id &&
                     (e.status === 'reservado' || e.status === 'retirado')
              );
              if (jaEmprestado) {
                return (
                  <View style={[s.btnDetalheReserva, { backgroundColor: CORES.muted }]}>
                    <Text style={s.btnDetalheReservaText}>✓ Já reservado</Text>
                  </View>
                );
              }
              if ((livroSelecionado?.disponiveis ?? 0) > 0) {
                return (
                  <TouchableOpacity style={s.btnDetalheReserva} onPress={() => handleReserva(livroSelecionado!)}>
                    <Text style={s.btnDetalheReservaText}>✓ Confirmar reserva</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  style={[s.btnDetalheReserva, { backgroundColor: CORES.muted }]}
                  onPress={async () => {
                    if (!usuario) return;
                    try {
                      await adicionarDesejo(String(livroSelecionado?.id), usuario.id);
                      Alert.alert('Fila de espera', 'Você foi adicionado à lista de desejos! Será avisado quando disponível.');
                      await carregarDados();
                    } catch {
                      Alert.alert('Aviso', 'Você já está na lista de desejos para este livro.');
                    }
                  }}>
                  <Text style={s.btnDetalheReservaText}>🔔 Entrar na fila de espera</Text>
                </TouchableOpacity>
              );
            })()}
            <TouchableOpacity
              style={[s.btnSecundario, { marginTop: 8 }]}
              onPress={() => setMarleneAberta(true)}>
              <Text style={s.btnSecundarioText}>📚 Perguntar para a Marlene</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnDetalheVoltar} onPress={() => setLivroSelecionado(null)}>
              <Text style={s.btnDetalheVoltarText}>Voltar ao acervo</Text>
            </TouchableOpacity>
          </View>

          {(() => {
            const avLivro = todasAvaliacoes.filter(a => a.livroId === livroSelecionado?.id);
            if (avLivro.length === 0) return null;
            const media = (avLivro.reduce((s, a) => s + a.nota, 0) / avLivro.length).toFixed(1);
            return (
              <View style={{ marginTop: 24 }}>
                <Text style={s.sectionLabel}>AVALIAÇÕES DA COMUNIDADE</Text>
                <View style={s.avaliacaoMediaRow}>
                  <Text style={s.avaliacaoMediaNum}>{media}</Text>
                  <View>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      {[1,2,3,4,5].map(i => (
                        <Text key={i} style={{ fontSize: 18, color: i <= Math.round(Number(media)) ? CORES.amber : CORES.border }}>★</Text>
                      ))}
                    </View>
                    <Text style={[s.loanAuthor, { marginTop: 4 }]}>{avLivro.length} avaliação(ões)</Text>
                  </View>
                </View>
                {avLivro.map(av => (
                  <View key={av.id} style={s.avaliacaoCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={s.avaliacaoNome}>{av.usuarioNome}</Text>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {[1,2,3,4,5].map(i => (
                          <Text key={i} style={{ fontSize: 13, color: i <= av.nota ? CORES.amber : CORES.border }}>★</Text>
                        ))}
                      </View>
                    </View>
                    {av.resenha ? <Text style={s.resenhaTexto}>"{av.resenha}"</Text> : null}
                    <Text style={[s.loanAuthor, { marginTop: 6 }]}>
                      {new Date(av.criadoEm).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
        {marleneAberta && livroSelecionado && (
          <MarleneChat
            livro={livroSelecionado}
            acervo={livros}
            token={token}
            onFechar={() => setMarleneAberta(false)}
          />
        )}
      </ScrollView>
    );
  }

  const renderHome = () => (
    <ScrollView
      style={{ flex: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => carregarDados(usuario, { pull: true })}
          tintColor={CORES.amber}
          colors={[CORES.amber]}
        />
      }
    >
      {atualizandoBg && (
        <Text style={{ fontSize: 11, color: CORES.muted, textAlign: 'center', paddingTop: 4 }}>Atualizando...</Text>
      )}
      <View style={s.homeHeader}>
        <View>
          <Text style={s.homeGreeting}>{saudacaoPorHorario} 👋</Text>
          <Text style={s.homeName}>{usuario?.nome}</Text>
        </View>
        <View style={s.homeAvatarSmall}>
          <Text style={s.homeAvatarText}>{usuario?.iniciais}</Text>
        </View>
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        {(() => {
          // Calcula destaques: livros com mais empréstimos + melhor avaliação
          const contagemEmprestimos = emprestimosAtivos.concat(historico).reduce((acc, emp) => {
            if (emp.livroId) acc[emp.livroId] = (acc[emp.livroId] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          const mediaAvaliacoes = todasAvaliacoes.reduce((acc, av) => {
            if (!acc[av.livroId]) acc[av.livroId] = { soma: 0, total: 0 };
            acc[av.livroId].soma += av.nota;
            acc[av.livroId].total += 1;
            return acc;
          }, {} as Record<string, { soma: number; total: number }>);

          const destaques = livros
            .filter(l => l.disponiveis > 0)
            .map(l => ({
              ...l,
              score: (contagemEmprestimos[l.id] || 0) * 2 +
                (mediaAvaliacoes[l.id] ? mediaAvaliacoes[l.id].soma / mediaAvaliacoes[l.id].total : 0),
              media: mediaAvaliacoes[l.id]
                ? (mediaAvaliacoes[l.id].soma / mediaAvaliacoes[l.id].total).toFixed(1)
                : null,
              emprestimos: contagemEmprestimos[l.id] || 0,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);

          if (destaques.length === 0) return null;

          return (
            <>
              <Text style={s.sectionLabel}>🔥 DESTAQUES DA SEMANA</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
                <View style={{ flexDirection: 'row', gap: 12, paddingRight: 16 }}>
                  {destaques.map((livro, index) => (
                    <TouchableOpacity
                      key={livro.id}
                      onPress={() => setLivroSelecionado(livro)}
                      style={{
                        width: 130,
                        backgroundColor: CORES.card,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: CORES.border,
                        overflow: 'hidden',
                      }}>
                      {livro.capa ? (
                        <Image source={{ uri: livro.capa }} style={{ width: 130, height: 90 }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: 130, height: 90, backgroundColor: index % 2 === 0 ? CORES.ink : CORES.sage, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 32 }}>📚</Text>
                        </View>
                      )}
                      <View style={{ padding: 8 }}>
                        {index === 0 && (
                          <View style={{ backgroundColor: 'rgba(201,123,46,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: CORES.amber }}>🔥 #1 Em alta</Text>
                          </View>
                        )}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: CORES.ink }} numberOfLines={2}>{livro.titulo}</Text>
                        <Text style={{ fontSize: 11, color: CORES.muted, marginTop: 2 }} numberOfLines={1}>{livro.autor}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {livro.media && (
                            <Text style={{ fontSize: 10, color: CORES.amber, fontWeight: '700' }}>★ {livro.media}</Text>
                          )}
                          {livro.emprestimos > 0 && (
                            <Text style={{ fontSize: 10, color: CORES.muted }}>{livro.emprestimos} emp.</Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          );
        })()}
        {erroConexao && (
          <View style={[s.emptyBox, { borderColor: CORES.rust, borderWidth: 1, marginBottom: 8 }]}>
            <Text style={[s.emptyText, { color: CORES.rust }]}>⚠️  Sem conexão com o servidor.{`\n`}Verifique o Wi-Fi e toque em Atualizar acervo.</Text>
          </View>
        )}
        {carregando ? <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} /> : (
          <>
            {emprestimosAtivos.length > 0 && (
              <>
                <Text style={s.sectionLabel}>MEU EMPRÉSTIMO ATIVO</Text>
                {emprestimosAtivos.slice(0, 1).map(emp => {
                  const livroDoEmprestimo = livros.find(livro => livro.id === emp.livroId);
                  const tituloLivro = emp.livroTitulo || livroDoEmprestimo?.titulo || `Livro #${emp.livroId}`;
                  return (
                    <View key={emp.id} style={s.loanCard}>
                      <View style={[s.loanCover, { backgroundColor: CORES.sage }]} />
                      <View style={s.loanInfo}>
                        <Text style={s.loanTitle}>{tituloLivro}</Text>
                        <Text style={s.loanAuthor}>Status: {emp.status}</Text>
                        <View style={s.progressBar}>
                          <View style={[s.progressFill, { width: `${calcularProgresso(emp)}%` }]} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
            <Text style={s.sectionLabel}>ACERVO DISPONÍVEL</Text>
            {livros.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>Nenhum livro no acervo ainda</Text>
              </View>
            ) : (
              <>
                {livrosPaginadosHome.map(livro => (
                  <TouchableOpacity key={livro.id} style={s.loanCard} onPress={() => setLivroSelecionado(livro)}>
                    {livro.capa ? (
                      <Image source={{ uri: livro.capa }} style={s.loanCover} resizeMode="cover" />
                    ) : (
                      <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
                    )}
                    <View style={s.loanInfo}>
                      <Text style={s.loanTitle}>{livro.titulo}</Text>
                      <Text style={s.loanAuthor}>{livro.autor}</Text>
                      <View style={[s.badgeSmall, { backgroundColor: livro.disponiveis > 0 ? 'rgba(74,124,89,0.12)' : 'rgba(184,76,46,0.12)' }]}>
                        <Text style={[s.badgeText, { color: livro.disponiveis > 0 ? CORES.sage : CORES.rust }]}>
                          {livro.disponiveis > 0 ? `✓ ${livro.disponiveis} disponível(is)` : '✗ Indisponível'}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: CORES.muted, fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                ))}
                {totalPaginasHome > 1 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
                    <TouchableOpacity
                      style={[s.btnSecundario, { flex: 1, opacity: paginaHome <= 1 ? 0.4 : 1 }]}
                      disabled={paginaHome <= 1}
                      onPress={() => setPaginaHome(p => p - 1)}>
                      <Text style={s.btnSecundarioText}>← Anterior</Text>
                    </TouchableOpacity>
                    <Text style={{ color: CORES.muted, fontSize: 13, minWidth: 60, textAlign: 'center' }}>
                      {paginaHome}/{totalPaginasHome}
                    </Text>
                    <TouchableOpacity
                      style={[s.btnSecundario, { flex: 1, opacity: paginaHome >= totalPaginasHome ? 0.4 : 1 }]}
                      disabled={paginaHome >= totalPaginasHome}
                      onPress={() => setPaginaHome(p => p + 1)}>
                      <Text style={s.btnSecundarioText}>Próxima →</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );

  function renderBusca() {
    return (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.homeHeader}>
          <View>
            <Text style={s.homeGreeting}>Explorar acervo</Text>
            <Text style={s.homeName}>{livrosFiltrados.length} livros</Text>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <TouchableOpacity style={[s.btnSecundario, { marginBottom: 10 }]} onPress={() => carregarDados()}>
            <Text style={s.btnSecundarioText}>Atualizar acervo</Text>
          </TouchableOpacity>
          <TextInput style={[s.input, { marginBottom: 12 }]}
            placeholder="🔍  Buscar por título ou autor..."
            placeholderTextColor={CORES.muted}
            value={buscaInput} onChangeText={handleBuscaChange} />
          <Text style={s.sectionLabel}>DISPONIBILIDADE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'disponivel', label: '✓ Disponível' },
                { key: 'indisponivel', label: '✗ Indisponível' },
              ].map(f => (
                <TouchableOpacity key={f.key}
                  style={[s.filtroBtn, filtroDisp === f.key && s.filtroBtnAtivo]}
                  onPress={() => setFiltroDisp(f.key)}>
                  <Text style={[s.filtroText, filtroDisp === f.key && s.filtroTextAtivo]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={s.sectionLabel}>GÊNERO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {generosUnicos.map(g => (
                <TouchableOpacity key={g}
                  style={[s.filtroBtn, filtroGenero === g && s.filtroBtnAtivo]}
                  onPress={() => setFiltroGenero(g)}>
                  <Text style={[s.filtroText, filtroGenero === g && s.filtroTextAtivo]}>
                    {g === 'todos' ? 'Todos' : g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={s.sectionLabel}>ORDENAÇÃO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { key: 'titulo', label: 'A–Z Título' },
                { key: 'autor', label: 'A–Z Autor' },
                { key: 'disponiveis', label: '✓ Disponíveis' },
                { key: 'popular', label: '⭐ Populares' },
              ] as const).map(o => (
                <TouchableOpacity key={o.key}
                  style={[s.filtroBtn, ordemAcervo === o.key && s.filtroBtnAtivo]}
                  onPress={() => setOrdemAcervo(o.key)}>
                  <Text style={[s.filtroText, ordemAcervo === o.key && s.filtroTextAtivo]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {carregando ? (
            <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} />
          ) : livrosFiltrados.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>Nenhum livro encontrado{'\n'}Tente outros filtros</Text>
            </View>
          ) : (
            <>
              {livrosPaginados.map(livro => (
                <TouchableOpacity key={livro.id} style={s.loanCard} onPress={() => setLivroSelecionado(livro)}>
                  {livro.capa ? (
                    <Image source={{ uri: livro.capa }} style={s.loanCover} resizeMode="cover" />
                  ) : (
                    <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
                  )}
                  <View style={s.loanInfo}>
                    <Text style={s.loanTitle}>{livro.titulo}</Text>
                    <Text style={s.loanAuthor}>{livro.autor}</Text>
                    {livro.genero ? <Text style={[s.loanAuthor, { color: CORES.amber }]}>{livro.genero}</Text> : null}
                    <View style={[s.badgeSmall, { backgroundColor: livro.disponiveis > 0 ? 'rgba(74,124,89,0.12)' : 'rgba(184,76,46,0.12)' }]}>
                      <Text style={[s.badgeText, { color: livro.disponiveis > 0 ? CORES.sage : CORES.rust }]}>
                        {livro.disponiveis > 0 ? `✓ ${livro.disponiveis} disponível(is)` : '✗ Indisponível'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    <TouchableOpacity
                      onPress={() => handleToggleDesejo(livro)}
                      disabled={togglendoDesejo === livro.id}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 20, opacity: togglendoDesejo === livro.id ? 0.4 : 1 }}>
                        {desejos.find(d => d.livroId === livro.id) ? '❤️' : '🤍'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={{ color: CORES.muted, fontSize: 20 }}>›</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {totalPaginasLivros > 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
                  <TouchableOpacity
                    style={[s.btnSecundario, { flex: 1, opacity: paginaLivros <= 1 ? 0.4 : 1 }]}
                    disabled={paginaLivros <= 1}
                    onPress={() => setPaginaLivros(p => p - 1)}>
                    <Text style={s.btnSecundarioText}>← Anterior</Text>
                  </TouchableOpacity>
                  <Text style={{ color: CORES.muted, fontSize: 13, minWidth: 60, textAlign: 'center' }}>
                    {paginaLivros}/{totalPaginasLivros}
                  </Text>
                  <TouchableOpacity
                    style={[s.btnSecundario, { flex: 1, opacity: paginaLivros >= totalPaginasLivros ? 0.4 : 1 }]}
                    disabled={paginaLivros >= totalPaginasLivros}
                    onPress={() => setPaginaLivros(p => p + 1)}>
                    <Text style={s.btnSecundarioText}>Próxima →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  const renderEscreverResenha = () => {
    const livroObj = livros.find(l => l.id === livroParaResenhar?.livroId);
    const minhaAvaliacao = todasAvaliacoes.find(
      a => a.usuarioId === usuario?.id && a.livroId === livroParaResenhar?.livroId
    );
    const fecharResenha = () => {
      setTelaResenha(false);
      setLivroParaResenhar(null);
      setNotaResenha(0);
      setTextoResenha('');
    };
    return (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.homeHeader}>
          <TouchableOpacity onPress={fecharResenha} style={{ marginRight: 12 }}>
            <Text style={{ color: CORES.amberLt, fontSize: 16, fontWeight: '700' }}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={s.homeGreeting}>Avaliação de livro</Text>
        </View>
        <View style={{ padding: 20 }}>
          <View style={s.detalheCard}>
            {livroObj?.capa ? (
              <Image source={{ uri: livroObj.capa }} style={s.detalheCover} resizeMode="cover" />
            ) : (
              <View style={[s.detalheCover, { backgroundColor: CORES.muted }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.detalheTitulo}>{livroParaResenhar?.livroTitulo}</Text>
              <Text style={s.detalheAutor}>{livroParaResenhar?.livroAutor || '—'}</Text>
              {livroParaResenhar?.dataDevolucao ? (
                <Text style={[s.loanAuthor, { marginTop: 6 }]}>
                  Devolvido em {new Date(livroParaResenhar.dataDevolucao).toLocaleDateString('pt-BR')}
                </Text>
              ) : null}
            </View>
          </View>
          {minhaAvaliacao ? (
            <View style={s.resenhaJaCard}>
              <Text style={s.sectionLabel}>SUA AVALIAÇÃO</Text>
              <View style={{ flexDirection: 'row', gap: 4, marginVertical: 10 }}>
                {[1,2,3,4,5].map(i => (
                  <Text key={i} style={{ fontSize: 30, color: i <= minhaAvaliacao.nota ? CORES.amber : CORES.border }}>★</Text>
                ))}
              </View>
              {minhaAvaliacao.resenha ? (
                <Text style={s.resenhaTexto}>"{minhaAvaliacao.resenha}"</Text>
              ) : null}
              <Text style={[s.loanAuthor, { marginTop: 8 }]}>
                Enviado em {new Date(minhaAvaliacao.criadoEm).toLocaleDateString('pt-BR')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.sectionLabel}>SUA NOTA *</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20, justifyContent: 'center' }}>
                {[1,2,3,4,5].map(i => (
                  <TouchableOpacity key={i} onPress={() => setNotaResenha(i)}>
                    <Text style={{ fontSize: 42, color: i <= notaResenha ? CORES.amber : CORES.border }}>★</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.sectionLabel}>RESENHA (OPCIONAL)</Text>
              <TextInput
                style={[s.input, { height: 120, textAlignVertical: 'top', paddingTop: 12 }]}
                placeholder="Conte o que achou do livro, personagens, história..."
                placeholderTextColor={CORES.muted}
                value={textoResenha}
                onChangeText={setTextoResenha}
                multiline
                maxLength={1000}
              />
              <Text style={[s.loanAuthor, { textAlign: 'right', marginTop: 4 }]}>{textoResenha.length}/1000</Text>
              <TouchableOpacity
                style={[s.btnDetalheReserva, { marginTop: 16, opacity: enviandoResenha ? 0.7 : 1 }]}
                onPress={handleEnviarResenha}
                disabled={enviandoResenha}>
                {enviandoResenha
                  ? <ActivityIndicator color={CORES.ink} />
                  : <Text style={s.btnDetalheReservaText}>⭐ Enviar avaliação</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderQrRetirada = () => {
    const payload = dadosQrRetirada?.payload || '';
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}`;
    const expiraEm = dadosQrRetirada?.expiraEm
      ? new Date(dadosQrRetirada.expiraEm).toLocaleString('pt-BR')
      : '---';
    return (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.homeHeader}>
          <TouchableOpacity
            onPress={() => {
              cancelarPollingQr();
              setTelaQrRetirada(false);
              setEmprestimoQrAtual(null);
              setDadosQrRetirada(null);
            }}
            style={{ marginRight: 12 }}>
            <Text style={{ color: CORES.amberLt, fontSize: 16, fontWeight: '700' }}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={[s.homeGreeting, { flex: 1 }]}>QR para retirada física</Text>
        </View>
        <View style={{ padding: 16 }}>
          <View style={s.qrCard}>
            <Text style={s.qrTitle}>{emprestimoQrAtual?.livroTitulo || 'Empréstimo selecionado'}</Text>
            <Text style={s.qrSub}>Mostre este QR no balcão da biblioteca</Text>
            {payload ? (
              <Image source={{ uri: qrImageUrl }} style={s.qrImage} resizeMode="contain" />
            ) : null}
            <Text style={s.qrCodeText}>{dadosQrRetirada?.codigo || '---'}</Text>
            <Text style={s.qrExpireText}>Válido até: {expiraEm}</Text>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderMeusLivros = () => (
    <ScrollView style={{ flex: 1 }}>
      <View style={s.homeHeader}>
        <View>
          <Text style={s.homeGreeting}>Minhas Reservas</Text>
          <Text style={s.homeName}>{emprestimosAtivos.length + historico.length} livros</Text>
        </View>
      </View>
      <View style={{ padding: 16 }}>
        <Text style={s.sectionLabel}>EMPRÉSTIMOS ATIVOS</Text>
        {emprestimosAtivos.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>Nenhum empréstimo ativo</Text>
          </View>
        ) : emprestimosAtivos.map(emp => {
          const hoje = new Date();
          const prevista = emp.dataPrevistaDevolucao
            ?? (emp.dataRetirada ? new Date(new Date(emp.dataRetirada).getTime() + 8 * 24 * 60 * 60 * 1000).toISOString() : null);
          const dataDev = prevista && emp.status === 'retirado' ? new Date(prevista) : null;
          const diasRestantes = dataDev
            ? Math.ceil((dataDev.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
            : null;
          const atrasado = diasRestantes !== null && diasRestantes < 0;
          const urgente = diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 3;
          const capaUrl = emp.capa || livros.find(l => l.id === emp.livroId)?.capa || '';

          return (
            <View key={emp.id} style={[s.loanCard, atrasado && { borderColor: CORES.rust, borderWidth: 1.5 }]}>
              {capaUrl ? (
                <Image source={{ uri: capaUrl }} style={s.loanCover} resizeMode="cover" />
              ) : (
                <View style={[s.loanCover, { backgroundColor: CORES.sage }]} />
              )}
              <View style={s.loanInfo}>
                <Text style={s.loanTitle}>{emp.livroTitulo || `Livro #${emp.livroId}`}</Text>
                <Text style={s.loanAuthor}>{emp.livroAutor || '—'}</Text>
                <View style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)', marginTop: 6 }]}>
                  <Text style={[s.badgeText, { color: CORES.amber }]}>
                    {emp.renovado ? '🔄 Renovado' : emp.status}
                  </Text>
                </View>
                {emp.dataReserva ? (
                  <Text style={[s.loanAuthor, { marginTop: 4 }]}>
                    Reservado em {new Date(emp.dataReserva).toLocaleDateString('pt-BR')}
                  </Text>
                ) : null}

                {dataDev ? (
                  <View style={{ marginTop: 6 }}>
                    <Text style={[s.loanAuthor, {
                      color: atrasado ? CORES.rust : urgente ? CORES.amber : CORES.sage,
                      fontWeight: '600',
                    }]}>
                      {atrasado
                        ? `⚠️ Atrasado ${Math.abs(diasRestantes!)} dia(s)`
                        : urgente
                          ? `⚠️ Vence em ${diasRestantes} dia(s)`
                          : `📅 Devolver até ${dataDev.toLocaleDateString('pt-BR')}`}
                    </Text>
                    {!atrasado && !urgente && (
                      <Text style={[s.loanAuthor, { color: CORES.muted }]}>
                        {diasRestantes} dia(s) restante(s)
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
              <View style={{ gap: 6 }}>
                {emp.status === 'reservado' ? (
                  <TouchableOpacity
                    style={[s.btnAmber, { paddingHorizontal: 8, opacity: gerandoQrRetirada ? 0.7 : 1 }]}
                    onPress={() => handleGerarQrRetirada(emp)}
                    disabled={gerandoQrRetirada}>
                    <Text style={s.btnAmberText}>📱 QR retirada</Text>
                  </TouchableOpacity>
                ) : null}
                {emp.status === 'retirado' && !emp.renovado && (
                  <TouchableOpacity
                    style={[s.btnAmber, { paddingHorizontal: 8 }]}
                    onPress={() => handleRenovar(emp)}>
                    <Text style={s.btnAmberText}>🔄 Renovar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        <Text style={[s.sectionLabel, { marginTop: 16 }]}>HISTÓRICO</Text>
        {historico.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>Nenhuma devolução registrada</Text>
          </View>
        ) : historico.map(h => {
          const minhaAv = todasAvaliacoes.find(a => a.usuarioId === usuario?.id && a.livroId === h.livroId);
          return (
            <View key={h.id} style={s.loanCard}>
              <View style={[s.loanCover, { backgroundColor: CORES.muted }]} />
              <View style={s.loanInfo}>
                <Text style={s.loanTitle}>{h.livroTitulo || `Livro #${h.livroId}`}</Text>
                <Text style={s.loanAuthor}>{h.livroAutor || '—'}</Text>
                {h.dataDevolucao ? (
                  <Text style={[s.loanAuthor, { marginTop: 4 }]}>
                    Devolvido em {new Date(h.dataDevolucao).toLocaleDateString('pt-BR')}
                  </Text>
                ) : null}
                {minhaAv ? (
                  <View style={{ flexDirection: 'row', gap: 2, marginTop: 6 }}>
                    {[1,2,3,4,5].map(i => (
                      <Text key={i} style={{ fontSize: 13, color: i <= minhaAv.nota ? CORES.amber : CORES.border }}>★</Text>
                    ))}
                  </View>
                ) : null}
              </View>
              {minhaAv ? (
                <TouchableOpacity
                  style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)' }]}
                  onPress={() => { setLivroParaResenhar(h); setTelaResenha(true); }}>
                  <Text style={[s.badgeText, { color: CORES.amber }]}>✎ Editar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.btnAmber, { paddingHorizontal: 10 }]}
                  onPress={() => { setNotaResenha(0); setTextoResenha(''); setLivroParaResenhar(h); setTelaResenha(true); }}>
                  <Text style={s.btnAmberText}>⭐ Avaliar</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderListaDesejos = () => (
    <ScrollView style={{ flex: 1 }}>
      <View style={s.homeHeader}>
        <TouchableOpacity onPress={() => setTelaListaDesejos(false)} style={{ marginRight: 12 }}>
          <Text style={{ color: CORES.amberLt, fontSize: 16, fontWeight: '700' }}>← Voltar</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.homeGreeting}>Lista de Desejos</Text>
          <Text style={s.homeName}>{desejos.length} título(s)</Text>
        </View>
      </View>
      <View style={{ padding: 16 }}>
        {desejos.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>🤍</Text>
            <Text style={s.emptyText}>
              Sua lista de desejos está vazia.{'\n'}
              Toque em 🤍 em qualquer livro para salvar.
            </Text>
          </View>
        ) : desejos.map(d => {
          const livroAtual = livros.find(l => l.id === d.livroId);
          const disp = livroAtual?.disponiveis ?? 0;
          const tituloDesejo = d.livroTitulo || livroAtual?.titulo || `Livro #${d.livroId}`;
          const autorDesejo = d.livroAutor || livroAtual?.autor || '—';
          const generoDesejo = d.livroGenero || livroAtual?.genero || '';
          const capaDesejo = d.livroCapa || livroAtual?.capa || '';
          return (
            <View key={d.id} style={s.loanCard}>
              {capaDesejo ? (
                <Image source={{ uri: capaDesejo }} style={s.loanCover} resizeMode="cover" />
              ) : (
                <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
              )}
              <View style={s.loanInfo}>
                <Text style={s.loanTitle}>{tituloDesejo}</Text>
                <Text style={s.loanAuthor}>{autorDesejo}</Text>
                {generoDesejo ? (
                  <Text style={[s.loanAuthor, { color: CORES.amber }]}>{generoDesejo}</Text>
                ) : null}
                <View style={[s.badgeSmall, { backgroundColor: disp > 0 ? 'rgba(74,124,89,0.12)' : 'rgba(184,76,46,0.12)', marginTop: 6 }]}>
                  <Text style={[s.badgeText, { color: disp > 0 ? CORES.sage : CORES.rust }]}>
                    {disp > 0 ? `✓ Disponível` : '✗ Indisponível'}
                  </Text>
                </View>
              </View>
              <View style={{ gap: 8, alignItems: 'center' }}>
                {disp > 0 && livroAtual ? (
                  <TouchableOpacity
                    style={[s.btnAmber, { paddingHorizontal: 10 }]}
                    onPress={() => {
                      setTelaListaDesejos(false);
                      setAbaAtiva('buscar');
                      setLivroSelecionado(livroAtual);
                    }}>
                    <Text style={s.btnAmberText}>Reservar</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => handleToggleDesejo({ id: d.livroId })}
                  disabled={togglendoDesejo === d.livroId}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={{ fontSize: 20, opacity: togglendoDesejo === d.livroId ? 0.4 : 1 }}>❤️</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderPerfil = () => {
    const avaliacoesAluno = todasAvaliacoes.filter(a => a.usuarioId === usuario?.id);
    const livrosConcluidos = historico.length;
    const metasLeitura = [
      { id: 'meta-1', icon: '🌱', nome: 'Primeiros Passos', descricao: 'Concluir 1 leitura', progresso: livrosConcluidos, meta: 1 },
      { id: 'meta-2', icon: '📖', nome: 'Leitor Dedicado', descricao: 'Concluir 5 leituras', progresso: livrosConcluidos, meta: 5 },
      { id: 'meta-3', icon: '🏆', nome: 'Mestre da Biblioteca', descricao: 'Concluir 10 leituras', progresso: livrosConcluidos, meta: 10 },
      { id: 'meta-4', icon: '⭐', nome: 'Crítico Literário', descricao: 'Enviar 3 avaliações', progresso: avaliacoesAluno.length, meta: 3 },
      { id: 'meta-5', icon: '💡', nome: 'Explorador de Títulos', descricao: 'Salvar 5 livros na lista de desejos', progresso: desejos.length, meta: 5 },
    ];

    // Tela de histórico
    if (telaHistorico) {
      return (
        <ScrollView style={{ flex: 1 }}>
          <View style={s.homeHeader}>
            <TouchableOpacity onPress={() => setTelaHistorico(false)} style={{ marginRight: 12 }}>
              <Text style={{ color: CORES.amberLt, fontSize: 16, fontWeight: '700' }}>← Voltar</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.homeGreeting}>Histórico de Empréstimos</Text>
              <Text style={s.homeName}>{historico.length} livro(s) lido(s)</Text>
            </View>
          </View>
          <View style={{ padding: 16 }}>
            {historico.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>📚</Text>
                <Text style={s.emptyText}>Você ainda não devolveu nenhum livro.{'\n'}Seu histórico aparecerá aqui.</Text>
              </View>
            ) : historico.map(h => {
              const minhaAv = todasAvaliacoes.find(a => a.usuarioId === usuario?.id && a.livroId === h.livroId);
              return (
                <View key={h.id} style={s.loanCard}>
                  <View style={[s.loanCover, { backgroundColor: CORES.muted }]} />
                  <View style={s.loanInfo}>
                    <Text style={s.loanTitle}>{h.livroTitulo || `Livro #${h.livroId}`}</Text>
                    <Text style={s.loanAuthor}>{h.livroAutor || '—'}</Text>
                    {h.dataDevolucao ? (
                      <Text style={[s.loanAuthor, { marginTop: 4 }]}>
                        Devolvido em {new Date(h.dataDevolucao).toLocaleDateString('pt-BR')}
                      </Text>
                    ) : null}
                    {minhaAv ? (
                      <View style={{ flexDirection: 'row', gap: 2, marginTop: 6 }}>
                        {[1,2,3,4,5].map(i => (
                          <Text key={i} style={{ fontSize: 13, color: i <= minhaAv.nota ? CORES.amber : CORES.border }}>★</Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  {minhaAv ? (
                    <TouchableOpacity
                      style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)' }]}
                      onPress={() => { setLivroParaResenhar(h); setTelaResenha(true); }}>
                      <Text style={[s.badgeText, { color: CORES.amber }]}>✎ Editar</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[s.btnAmber, { paddingHorizontal: 10 }]}
                      onPress={() => { setNotaResenha(0); setTextoResenha(''); setLivroParaResenhar(h); setTelaResenha(true); }}>
                      <Text style={s.btnAmberText}>⭐ Avaliar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      );
    }

    // Tela de comunicados/notificações
    if (telaComunicadosPerfil) {
      return (
        <ComunicadosList
          comunicados={comunicados}
          titulo="Notificações"
          subtitulo={`${comunicados.length} comunicado(s)`}
          headerLeft={(
            <TouchableOpacity onPress={() => setTelaComunicadosPerfil(false)} style={{ marginRight: 12 }}>
              <Text style={{ color: CORES.amberLt, fontSize: 16, fontWeight: '700' }}>← Voltar</Text>
            </TouchableOpacity>
          )}
        />
      );
    }

    const _generoFav = (() => {
      const cnt: Record<string, number> = {};
      historico.forEach(emp => {
        const gen = livros.find(l => l.id === emp.livroId)?.genero;
        if (gen) cnt[gen] = (cnt[gen] || 0) + 1;
      });
      return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    })();
    const _prazoMedio = (() => {
      const dias = historico
        .filter(e => e.dataRetirada && e.dataDevolucao)
        .map(e => (new Date(e.dataDevolucao!).getTime() - new Date(e.dataRetirada!).getTime()) / 86400000);
      return dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null;
    })();

    return (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.perfilTop}>
          <View style={s.perfilAvatar}>
            <Text style={s.perfilAvatarText}>{usuario?.iniciais}</Text>
          </View>
          <Text style={s.perfilName}>{usuario?.nome}</Text>
          <Text style={s.perfilSub}>Turma {usuario?.turma} · {usuario?.email}</Text>
          <View style={s.perfilStats}>
            {[
              { num: historico.length + emprestimosAtivos.length, label: 'Lidos' },
              { num: emprestimosAtivos.length, label: 'Ativos' },
              { num: desejos.length, label: 'Desejos' },
            ].map((st, i) => (
              <View key={i} style={s.perfilStat}>
                <Text style={s.perfilStatNum}>{st.num}</Text>
                <Text style={s.perfilStatLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
          {(_generoFav || _prazoMedio !== null) && (
            <View style={[s.perfilStats, { marginTop: 10 }]}>
              {_generoFav ? (
                <View style={s.perfilStat}>
                  <Text style={[s.perfilStatNum, { fontSize: 13 }]} numberOfLines={1}>{_generoFav}</Text>
                  <Text style={s.perfilStatLabel}>Gênero fav.</Text>
                </View>
              ) : null}
              {_prazoMedio !== null ? (
                <View style={s.perfilStat}>
                  <Text style={s.perfilStatNum}>{_prazoMedio}d</Text>
                  <Text style={s.perfilStatLabel}>Prazo médio</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
        <View style={{ padding: 16 }}>
          {[
            { icon: '📚', title: 'Histórico de Empréstimos', sub: `${historico.length} livro(s) lido(s)`, acao: () => setTelaHistorico(true) },
            { icon: '🤍', title: 'Minha Lista de Desejos', sub: `${desejos.length} título(s) salvos`, acao: () => setTelaListaDesejos(true) },
            { icon: '🔔', title: 'Notificações', sub: `${comunicados.length} comunicado(s)`, acao: () => setTelaComunicadosPerfil(true) },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={s.menuItem} onPress={item.acao}>
              <View style={s.menuIcon}><Text style={{ fontSize: 18 }}>{item.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuTitle}>{item.title}</Text>
                <Text style={s.menuSub}>{item.sub}</Text>
              </View>
              <Text style={s.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
          <Text style={[s.sectionLabel, { marginTop: 20 }]}>SELOS DE LEITURA</Text>
          <View style={s.selosGrid}>
            {metasLeitura.map(selo => {
              const desbloqueado = selo.progresso >= selo.meta;
              const percentual = Math.min(100, Math.round((selo.progresso / selo.meta) * 100));
              return (
                <View key={selo.id} style={[s.seloCard, !desbloqueado && s.seloCardLocked]}>
                  <View style={s.seloHeader}>
                    <Text style={s.seloIcon}>{selo.icon}</Text>
                    <View style={[s.badgeSmall, { marginTop: 0, backgroundColor: desbloqueado ? 'rgba(74,124,89,0.15)' : 'rgba(138,125,104,0.15)' }]}>
                      <Text style={[s.badgeText, { color: desbloqueado ? CORES.sage : CORES.muted }]}>
                        {desbloqueado ? 'Desbloqueado' : `${percentual}%`}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.seloTitulo}>{selo.nome}</Text>
                  <Text style={s.seloDesc}>{selo.descricao}</Text>
                  <View style={s.seloBarraBg}>
                    <View style={[s.seloBarraFill, { width: `${percentual}%` }]} />
                  </View>
                  <Text style={s.seloMeta}>{Math.min(selo.progresso, selo.meta)}/{selo.meta}</Text>
                </View>
              );
            })}
          </View>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Text style={s.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteAccountBtn} onPress={handleExcluirConta}>
            <Text style={s.deleteAccountText}>Excluir minha conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ── PAINEL BIBLIOTECÁRIO ──
  if (tela === 'bibliotecario') {
    const renderDashboard = () => (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.homeHeader}>
          <View>
            <Text style={s.homeGreeting}>{usuario?.perfil === 'coordenacao' ? 'Painel da Coordenação' : 'Painel do Bibliotecário'}</Text>
            <Text style={s.homeName}>{usuario?.nome}</Text>
          </View>
          <View style={s.homeAvatarSmall}>
            <Text style={s.homeAvatarText}>{usuario?.iniciais}</Text>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <TouchableOpacity style={[s.btnSecundario, { marginBottom: 12 }]} onPress={() => carregarDados()}>
            <Text style={s.btnSecundarioText}>↻  Atualizar painel</Text>
          </TouchableOpacity>
          {carregando ? <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} /> : erroConexao ? (
            <View style={s.emptyBox}>
              <Text style={[s.emptyText, { color: CORES.rust, marginBottom: 12 }]}>Falha ao carregar dados.{'\n'}Verifique sua conexão.</Text>
              <TouchableOpacity style={s.btnSecundario} onPress={() => carregarDados()}>
                <Text style={s.btnSecundarioText}>↻  Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={s.statsRow}>
                {[
                  { num: emprestimosAtivos.length, label: 'Ativos', cor: CORES.sage },
                  { num: livros.filter(l => l.disponiveis > 0).length, label: 'Disponíveis', cor: CORES.amber },
                  { num: livros.length, label: 'Total livros', cor: CORES.ink },
                  { num: historico.length, label: 'Devolvidos', cor: CORES.muted },
                ].map((st, i) => (
                  <View key={i} style={s.statCard}>
                    <Text style={[s.statNum, { color: st.cor }]}>{st.num}</Text>
                    <Text style={s.statLabel}>{st.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.sectionLabel}>VALIDAR RETIRADA POR QR</Text>
              <View style={s.qrValidationBox}>
                <TextInput
                  style={[s.input, { marginBottom: 8 }]}
                  placeholder="Cole o código do QR (ex: A1B2C3D4)"
                  placeholderTextColor={CORES.muted}
                  value={codigoQrRetirada}
                  onChangeText={setCodigoQrRetirada}
                  autoCapitalize="characters"
                />
                <TouchableOpacity style={[s.btnSecundario, { marginBottom: 8 }]} onPress={handleAbrirScannerQr}>
                  <Text style={s.btnSecundarioText}>Ler QR com câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btnPrimary, { opacity: validandoQrRetirada ? 0.7 : 1 }]}
                  onPress={handleValidarQrRetirada}
                  disabled={validandoQrRetirada}>
                  {validandoQrRetirada ? <ActivityIndicator color={CORES.ink} /> : <Text style={s.btnPrimaryText}>Confirmar retirada via QR</Text>}
                </TouchableOpacity>
              </View>
              <Text style={s.sectionLabel}>EMPRÉSTIMOS ATIVOS</Text>
              {(() => {
                const turmasUnicas = ['todas', ...Array.from(new Set(emprestimosAtivos.map(e => e.usuarioTurma).filter(Boolean))) as string[]];
                const empFiltrados = emprestimosAtivos.filter(e => {
                  const turmaOk = filtroEmpTurma === 'todas' || e.usuarioTurma === filtroEmpTurma;
                  const statusOk = filtroEmpStatus === 'todos' || e.status === filtroEmpStatus;
                  return turmaOk && statusOk;
                });
                return (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      {([
                        { key: 'todos', label: 'Todos' },
                        { key: 'reservado', label: 'Reservados' },
                        { key: 'retirado', label: 'Retirados' },
                      ] as const).map(f => (
                        <TouchableOpacity key={f.key}
                          style={[s.filtroBtn, filtroEmpStatus === f.key && s.filtroBtnAtivo]}
                          onPress={() => setFiltroEmpStatus(f.key)}>
                          <Text style={[s.filtroText, filtroEmpStatus === f.key && s.filtroTextAtivo]}>{f.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {turmasUnicas.length > 1 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {turmasUnicas.map(t => (
                            <TouchableOpacity key={t}
                              style={[s.filtroBtn, filtroEmpTurma === t && s.filtroBtnAtivo]}
                              onPress={() => setFiltroEmpTurma(t)}>
                              <Text style={[s.filtroText, filtroEmpTurma === t && s.filtroTextAtivo]}>
                                {t === 'todas' ? 'Todas turmas' : `Turma ${t}`}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    )}
                    {empFiltrados.length === 0 ? (
                      <View style={s.emptyBox}>
                        <Text style={s.emptyText}>Nenhum empréstimo ativo{filtroEmpTurma !== 'todas' || filtroEmpStatus !== 'todos' ? ' com estes filtros' : ''}</Text>
                      </View>
                    ) : empFiltrados.map(emp => {
                      const capaUrl = emp.capa || livros.find(l => l.id === emp.livroId)?.capa || '';
                      const diasVencer = emp.dataPrevistaDevolucao
                        ? Math.ceil((new Date(emp.dataPrevistaDevolucao).getTime() - Date.now()) / 86400000)
                        : null;
                      const alertaVencendo = diasVencer !== null && diasVencer <= 2;
                      return (
                        <View key={emp.id} style={[s.loanCard, alertaVencendo && { borderLeftWidth: 3, borderLeftColor: diasVencer! < 0 ? CORES.rust : CORES.amber }]}>
                          {capaUrl ? (
                            <Image source={{ uri: capaUrl }} style={s.loanCover} resizeMode="cover" />
                          ) : (
                            <View style={[s.loanCover, { backgroundColor: CORES.sage }]} />
                          )}
                          <View style={s.loanInfo}>
                            <Text style={s.loanTitle}>{emp.livroTitulo || `Livro #${emp.livroId}`}</Text>
                            <Text style={s.loanAuthor}>{emp.usuarioNome || `Usuário #${emp.usuarioId}`}</Text>
                            {emp.usuarioTurma ? (
                              <Text style={[s.loanAuthor, { color: CORES.amber }]}>Turma {emp.usuarioTurma}</Text>
                            ) : null}
                            <View style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)', marginTop: 6 }]}>
                              <Text style={[s.badgeText, { color: CORES.amber }]}>{emp.status}</Text>
                            </View>
                            {alertaVencendo && (
                              <View style={[s.badgeSmall, { backgroundColor: diasVencer! < 0 ? 'rgba(184,76,46,0.15)' : 'rgba(201,123,46,0.15)', marginTop: 4 }]}>
                                <Text style={[s.badgeText, { color: diasVencer! < 0 ? CORES.rust : CORES.amber }]}>
                                  {diasVencer! < 0 ? `⏰ Atrasado ${Math.abs(diasVencer!)}d` : diasVencer === 0 ? '⏰ Vence hoje' : `⏰ Vence em ${diasVencer}d`}
                                </Text>
                              </View>
                            )}
                          </View>
                          <TouchableOpacity style={s.btnAmber} onPress={() => handleDevolucao(emp)}>
                            <Text style={s.btnAmberText}>Devolver</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.btnAmber, { backgroundColor: CORES.rust, paddingHorizontal: 8, marginTop: 4 }]}
                            onPress={() => {
                              Alert.prompt(
                                'Bloquear aluno',
                                'Quantos dias de bloqueio?',
                                (dias) => {
                                  if (!dias || isNaN(Number(dias))) return;
                                  Alert.prompt('Motivo', 'Informe o motivo (opcional)', (motivo) => {
                                    handleAplicarSuspensao(emp, Number(dias), motivo || 'Devolução em atraso');
                                  });
                                },
                                'plain-text',
                                '',
                                'number-pad'
                              );
                            }}>
                            <Text style={s.btnAmberText}>🚫 Bloquear</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </>
                );
              })()}
            </>
          )}
        </View>
      </ScrollView>
    );

    const renderGestao = () => (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.homeHeader}>
          <View>
            <Text style={s.homeGreeting}>Acervo</Text>
            <Text style={s.homeName}>{livros.length} livros</Text>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          {carregando ? <ActivityIndicator color={CORES.amber} size="large" /> :
            livros.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>Nenhum livro cadastrado{'\n'}Use o painel web para adicionar</Text>
              </View>
            ) : (
              <>
                {livrosPaginadosGestao.map(livro => (
                  <View key={livro.id} style={s.loanCard}>
                    {livro.capa ? (
                      <Image source={{ uri: livro.capa }} style={s.loanCover} resizeMode="cover" />
                    ) : (
                      <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
                    )}
                    <View style={s.loanInfo}>
                      <Text style={s.loanTitle}>{livro.titulo}</Text>
                      <Text style={s.loanAuthor}>{livro.autor}</Text>
                      <View style={[s.badgeSmall, { backgroundColor: livro.disponiveis > 0 ? 'rgba(74,124,89,0.12)' : 'rgba(184,76,46,0.12)' }]}>
                        <Text style={[s.badgeText, { color: livro.disponiveis > 0 ? CORES.sage : CORES.rust }]}>
                          {livro.disponiveis > 0 ? `✓ ${livro.disponiveis} disponível(is)` : '✗ Indisponível'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
                {totalPaginasGestao > 1 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
                    <TouchableOpacity
                      style={[s.btnSecundario, { flex: 1, opacity: paginaGestao <= 1 ? 0.4 : 1 }]}
                      disabled={paginaGestao <= 1}
                      onPress={() => setPaginaGestao(p => p - 1)}>
                      <Text style={s.btnSecundarioText}>← Anterior</Text>
                    </TouchableOpacity>
                    <Text style={{ color: CORES.muted, fontSize: 13, minWidth: 60, textAlign: 'center' }}>
                      {paginaGestao}/{totalPaginasGestao}
                    </Text>
                    <TouchableOpacity
                      style={[s.btnSecundario, { flex: 1, opacity: paginaGestao >= totalPaginasGestao ? 0.4 : 1 }]}
                      disabled={paginaGestao >= totalPaginasGestao}
                      onPress={() => setPaginaGestao(p => p + 1)}>
                      <Text style={s.btnSecundarioText}>Próxima →</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )
          }
        </View>
      </ScrollView>
    );

    const renderAdmin = () => (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.homeHeader}>
          <View>
            <Text style={s.homeGreeting}>Admin mobile</Text>
            <Text style={s.homeName}>{usuariosAdmin.length} usuários</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <TouchableOpacity style={[s.btnSecundario, { marginBottom: 12 }]} onPress={() => carregarDados()}>
            <Text style={s.btnSecundarioText}>↻  Atualizar</Text>
          </TouchableOpacity>
        </View>
        <View style={{ padding: 16 }}>

          {/* ── CADASTRO POR FOTO ── */}
          <Text style={s.sectionLabel}>CADASTRAR LIVRO POR FOTO</Text>
          <View style={s.qrValidationBox}>
            <Text style={[s.loanAuthor, { textAlign: 'center', marginBottom: 12 }]}>
              📸 Tire uma foto da capa do livro e a IA identifica os dados automaticamente
            </Text>
            <TouchableOpacity
              style={[s.btnPrimary, { opacity: scanandoCapa ? 0.7 : 1 }]}
              onPress={handleScanCapa}
              disabled={scanandoCapa}>
              {scanandoCapa
                ? <ActivityIndicator color={CORES.ink} />
                : <Text style={s.btnPrimaryText}>📷 Fotografar capa</Text>}
            </TouchableOpacity>

            {livroScaneado && (
              <View style={{ marginTop: 16 }}>
                {/* ── DADOS IDENTIFICADOS ── */}
                <Text style={[s.sectionLabel, { marginTop: 0 }]}>DADOS IDENTIFICADOS</Text>
                <View style={[s.loanCard, { flexDirection: 'column', gap: 8 }]}>
                  {/* Preview da capa se encontrada */}
                  {livroScaneado.capa ? (
                    <View style={{ alignItems: 'center', marginBottom: 8 }}>
                      <Image
                        source={{ uri: livroScaneado.capa }}
                        style={{ width: 80, height: 110, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                      <Text style={[s.loanAuthor, { marginTop: 4, color: CORES.sage }]}>✓ Capa encontrada</Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ width: 80, height: 110, borderRadius: 8, backgroundColor: CORES.warm, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 32 }}>📚</Text>
                      </View>
                      <Text style={[s.loanAuthor, { marginTop: 4, color: CORES.muted }]}>Sem capa disponível</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[s.loanAuthor, { fontWeight: '700', color: CORES.muted }]}>Título</Text>
                    <Text style={[s.loanTitle, { flex: 1, textAlign: 'right' }]}>{livroScaneado.titulo}</Text>
                  </View>
                  {livroScaneado.autor ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[s.loanAuthor, { fontWeight: '700', color: CORES.muted }]}>Autor</Text>
                      <Text style={[s.loanAuthor, { flex: 1, textAlign: 'right' }]}>{livroScaneado.autor}</Text>
                    </View>
                  ) : null}
                  {livroScaneado.genero ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[s.loanAuthor, { fontWeight: '700', color: CORES.muted }]}>Gênero</Text>
                      <Text style={[s.loanAuthor, { flex: 1, textAlign: 'right' }]}>{livroScaneado.genero}</Text>
                    </View>
                  ) : null}
                  {livroScaneado.sinopse ? (
                    <View>
                      <Text style={[s.loanAuthor, { fontWeight: '700', color: CORES.muted }]}>Sinopse</Text>
                      <Text style={[s.loanAuthor, { marginTop: 4 }]}>{livroScaneado.sinopse}</Text>
                    </View>
                  ) : null}
                </View>

                {/* ── QUANTIDADE DE EXEMPLARES ── */}
                <Text style={[s.label, { marginTop: 16 }]}>QUANTIDADE DE EXEMPLARES *</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                  <TouchableOpacity
                    style={[s.btnDetalheVoltar, { width: 44, height: 44, borderRadius: 22 }]}
                    onPress={() => setLivroScaneado(prev => prev ? {
                      ...prev,
                      totalExemplares: Math.max(1, (prev.totalExemplares || 1) - 1)
                    } : prev)}>
                    <Text style={[s.btnDetalheVoltarText, { fontSize: 20 }]}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[s.input, { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', marginBottom: 0 }]}
                    value={String(livroScaneado.totalExemplares || 1)}
                    onChangeText={v => {
                      const num = parseInt(v) || 1;
                      setLivroScaneado(prev => prev ? { ...prev, totalExemplares: Math.max(1, num) } : prev);
                    }}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <TouchableOpacity
                    style={[s.btnAmber, { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }]}
                    onPress={() => setLivroScaneado(prev => prev ? {
                      ...prev,
                      totalExemplares: (prev.totalExemplares || 1) + 1
                    } : prev)}>
                    <Text style={[s.btnAmberText, { fontSize: 20 }]}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[s.label, { marginTop: 12 }]}>PRATELEIRA</Text>
                <TextInput
                  style={s.input}
                  placeholder="Ex: A1, B3, Corredor 2..."
                  placeholderTextColor={CORES.muted}
                  value={livroScaneado.prateleira || ''}
                  onChangeText={v => setLivroScaneado(prev => prev ? { ...prev, prateleira: v } : prev)}
                  autoCapitalize="characters"
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[s.btnDetalheVoltar, { flex: 1 }]}
                    onPress={() => setLivroScaneado(null)}>
                    <Text style={s.btnDetalheVoltarText}>Descartar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnDetalheReserva, { flex: 2, opacity: salvandoScan ? 0.7 : 1 }]}
                    onPress={handleSalvarLivroScaneado}
                    disabled={salvandoScan}>
                    {salvandoScan
                      ? <ActivityIndicator color={CORES.ink} />
                      : <Text style={s.btnDetalheReservaText}>✓ Confirmar cadastro</Text>}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[s.btnSecundario, { marginTop: 8 }]}
                  onPress={handleScanCapa}
                  disabled={scanandoCapa}>
                  <Text style={s.btnSecundarioText}>📷 Fotografar novamente</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity style={[s.btnSecundario, { marginBottom: 12, marginTop: 8 }]} onPress={() => carregarDados()}>
            <Text style={s.btnSecundarioText}>Atualizar dados do painel</Text>
          </TouchableOpacity>

          <Text style={s.sectionLabel}>MANUTENÇÃO DE DADOS</Text>
          <View style={s.qrValidationBox}>
            <Text style={[s.loanAuthor, { textAlign: 'center', marginBottom: 12 }]}>
              🔧 Remove empréstimos sem usuário vinculado (dados corrompidos) e devolve os exemplares ao acervo.
            </Text>
            <TouchableOpacity
              style={[s.btnPrimary, { backgroundColor: CORES.rust, opacity: reparando ? 0.7 : 1 }]}
              onPress={async () => {
                setReparando(true);
                try {
                  const data = await repararEmprestimos();
                  Alert.alert('Reparo concluído', data.mensagem);
                  await carregarDados();
                } catch (err) {
                  Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível executar o reparo.'));
                } finally {
                  setReparando(false);
                }
              }}
              disabled={reparando}>
              {reparando
                ? <ActivityIndicator color={CORES.parch} />
                : <Text style={[s.btnPrimaryText, { color: CORES.parch }]}>🔧 Reparar empréstimos órfãos</Text>}
            </TouchableOpacity>
          </View>

          <Text style={[s.sectionLabel, { marginTop: 16 }]}>USUÁRIOS CADASTRADOS</Text>
          {usuariosAdmin.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>Nenhum usuário encontrado</Text>
            </View>
          ) : (
            <>
              {usuariosPaginadosAdmin.map(u => (
                <View key={u.id} style={s.menuItem}>
                  <View style={s.menuIcon}><Text style={{ fontSize: 16 }}>👤</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.menuTitle}>{u.nome}</Text>
                    <Text style={s.menuSub}>{u.email}</Text>
                  </View>
                  <View style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)', marginTop: 0 }]}>
                    <Text style={[s.badgeText, { color: CORES.amber }]}>{u.perfil}</Text>
                  </View>
                </View>
              ))}
              {totalPaginasAdminUsuarios > 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
                  <TouchableOpacity
                    style={[s.btnSecundario, { flex: 1, opacity: paginaAdminUsuarios <= 1 ? 0.4 : 1 }]}
                    disabled={paginaAdminUsuarios <= 1}
                    onPress={() => setPaginaAdminUsuarios(p => p - 1)}>
                    <Text style={s.btnSecundarioText}>← Anterior</Text>
                  </TouchableOpacity>
                  <Text style={{ color: CORES.muted, fontSize: 13, minWidth: 60, textAlign: 'center' }}>
                    {paginaAdminUsuarios}/{totalPaginasAdminUsuarios}
                  </Text>
                  <TouchableOpacity
                    style={[s.btnSecundario, { flex: 1, opacity: paginaAdminUsuarios >= totalPaginasAdminUsuarios ? 0.4 : 1 }]}
                    disabled={paginaAdminUsuarios >= totalPaginasAdminUsuarios}
                    onPress={() => setPaginaAdminUsuarios(p => p + 1)}>
                    <Text style={s.btnSecundarioText}>Próxima →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>LIVROS CADASTRADOS</Text>
          {livros.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>Nenhum livro cadastrado</Text>
            </View>
          ) : (
            <>
              {livrosPaginadosAdmin.map(livro => (
                <View key={livro.id} style={s.loanCard}>
                  {livro.capa ? (
                    <Image source={{ uri: livro.capa }} style={s.loanCover} resizeMode="cover" />
                  ) : (
                    <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
                  )}
                  <View style={s.loanInfo}>
                    <Text style={s.loanTitle}>{livro.titulo}</Text>
                    <Text style={s.loanAuthor}>{livro.autor || '—'}</Text>
                    <Text style={s.loanAuthor}>Exemplares: {livro.totalExemplares || 0}</Text>
                    <Text style={[s.loanAuthor, { color: Number(livro.disponiveis) > 0 ? CORES.sage : CORES.rust }]}>Disponíveis: {livro.disponiveis || 0}</Text>
                  </View>
                </View>
              ))}
              {totalPaginasAdminLivros > 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
                  <TouchableOpacity
                    style={[s.btnSecundario, { flex: 1, opacity: paginaAdminLivros <= 1 ? 0.4 : 1 }]}
                    disabled={paginaAdminLivros <= 1}
                    onPress={() => setPaginaAdminLivros(p => p - 1)}>
                    <Text style={s.btnSecundarioText}>← Anterior</Text>
                  </TouchableOpacity>
                  <Text style={{ color: CORES.muted, fontSize: 13, minWidth: 60, textAlign: 'center' }}>
                    {paginaAdminLivros}/{totalPaginasAdminLivros}
                  </Text>
                  <TouchableOpacity
                    style={[s.btnSecundario, { flex: 1, opacity: paginaAdminLivros >= totalPaginasAdminLivros ? 0.4 : 1 }]}
                    disabled={paginaAdminLivros >= totalPaginasAdminLivros}
                    onPress={() => setPaginaAdminLivros(p => p + 1)}>
                    <Text style={s.btnSecundarioText}>Próxima →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    );

    const renderPerfilBiblio = () => (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.perfilTop}>
          <View style={s.perfilAvatar}>
            <Text style={s.perfilAvatarText}>{usuario?.iniciais}</Text>
          </View>
          <Text style={s.perfilName}>{usuario?.nome}</Text>
          <Text style={s.perfilSub}>{usuario?.email}</Text>
          <View style={s.perfilBadge}>
            <Text style={s.perfilBadgeTitle}>{BIBLIOTECA}</Text>
            <Text style={s.perfilBadgeSub}>{ESCOLA}</Text>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Text style={s.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteAccountBtn} onPress={handleExcluirConta}>
            <Text style={s.deleteAccountText}>Excluir minha conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );

    const renderScannerQrBiblio = () => (
      <SafeAreaView style={s.container}>
        <View style={s.scannerHeader}>
          <TouchableOpacity onPress={() => setTelaScannerQr(false)}>
            <Text style={s.scannerBack}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={s.scannerTitle}>Scanner QR de retirada</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, padding: 16 }}>
          <View style={s.scannerFrame}>
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => handleQrScaneado(data)}
            />
            {scannerFeedback ? (
              <View style={s.scannerFeedbackOverlay}>
                <Text style={s.scannerFeedbackTitle}>Retirada Confirmada</Text>
                <Text style={s.scannerFeedbackText}>{scannerFeedback.livro}</Text>
                <Text style={s.scannerFeedbackText}>{scannerFeedback.usuario}</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.scannerHint}>Aponte para o QR exibido no celular do aluno.</Text>
          {scanBloqueado ? (
            <TouchableOpacity style={[s.btnSecundario, { marginTop: 8 }]} onPress={() => {
              scanBloqueadoRef.current = false;
              setScanBloqueado(false);
            }}>
              <Text style={s.btnSecundarioText}>Escanear novamente</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>
    );

    const abasBiblio = [
      { key: 'dashboard', icon: '📊', label: 'Painel' },
      { key: 'gestao', icon: '📚', label: 'Gestão' },
      { key: 'admin', icon: '🛠️', label: 'Admin' },
      { key: 'avisos', icon: '🔔', label: 'Avisos' },
      { key: 'perfil', icon: '👤', label: 'Perfil' },
    ];

    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1 }}>
          {telaScannerQr && renderScannerQrBiblio()}
          {!telaScannerQr && abaBiblio === 'dashboard' && renderDashboard()}
          {!telaScannerQr && abaBiblio === 'gestao' && renderGestao()}
          {!telaScannerQr && abaBiblio === 'admin' && renderAdmin()}
          {!telaScannerQr && abaBiblio === 'perfil' && renderPerfilBiblio()}
          {!telaScannerQr && abaBiblio === 'avisos' && renderNotificacoes()}
        </View>
        <View style={s.tabBar}>
          {abasBiblio.map(aba => (
            <TouchableOpacity key={aba.key} style={s.tabItem} onPress={() => {
              setAbaBiblio(aba.key as AbaBiblio);
            }}>
              <Text style={{ fontSize: 20 }}>{aba.icon}</Text>
              <Text style={[s.tabLabel, abaBiblio === aba.key && { color: CORES.amber, fontWeight: '600' }]}>
                {aba.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ── TELAS DO PROFESSOR ──
  if (tela === 'professor') {
    const renderHomeProfessor = () => (
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => carregarDados(usuario, { pull: true })}
            tintColor={CORES.amber}
            colors={[CORES.amber]}
          />
        }
      >
        {atualizandoBg && (
          <Text style={{ fontSize: 11, color: CORES.muted, textAlign: 'center', paddingTop: 4 }}>Atualizando...</Text>
        )}
        <View style={s.homeHeader}>
          <View>
            <Text style={s.homeGreeting}>{saudacaoPorHorario}, Professor(a) 👋</Text>
            <Text style={s.homeName}>{usuario?.nome}</Text>
          </View>
          <View style={s.homeAvatarSmall}>
            <Text style={s.homeAvatarText}>{usuario?.iniciais}</Text>
          </View>
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          {carregando ? <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} /> : (
            <>
              {(() => {
                const contagemEmprestimos = emprestimosAtivos.concat(historico).reduce((acc, emp) => {
                  if (emp.livroId) acc[emp.livroId] = (acc[emp.livroId] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                const mediaAvaliacoes = todasAvaliacoes.reduce((acc, av) => {
                  if (!acc[av.livroId]) acc[av.livroId] = { soma: 0, total: 0 };
                  acc[av.livroId].soma += av.nota;
                  acc[av.livroId].total += 1;
                  return acc;
                }, {} as Record<string, { soma: number; total: number }>);

                const destaques = livros
                  .filter(l => l.disponiveis > 0)
                  .map(l => ({
                    ...l,
                    score: (contagemEmprestimos[l.id] || 0) * 2 +
                      (mediaAvaliacoes[l.id] ? mediaAvaliacoes[l.id].soma / mediaAvaliacoes[l.id].total : 0),
                    media: mediaAvaliacoes[l.id]
                      ? (mediaAvaliacoes[l.id].soma / mediaAvaliacoes[l.id].total).toFixed(1)
                      : null,
                    emprestimos: contagemEmprestimos[l.id] || 0,
                  }))
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 6);

                if (destaques.length === 0) return null;

                return (
                  <>
                    <Text style={s.sectionLabel}>🔥 DESTAQUES DA SEMANA</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 12, paddingRight: 16 }}>
                        {destaques.map((livro, index) => (
                          <TouchableOpacity
                            key={livro.id}
                            onPress={() => setLivroSelecionado(livro)}
                            style={{
                              width: 130,
                              backgroundColor: CORES.card,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: CORES.border,
                              overflow: 'hidden',
                            }}>
                            {livro.capa ? (
                              <Image source={{ uri: livro.capa }} style={{ width: 130, height: 90 }} resizeMode="cover" />
                            ) : (
                              <View style={{ width: 130, height: 90, backgroundColor: index % 2 === 0 ? CORES.ink : CORES.sage, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 32 }}>📚</Text>
                              </View>
                            )}
                            <View style={{ padding: 8 }}>
                              {index === 0 && (
                                <View style={{ backgroundColor: 'rgba(201,123,46,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: CORES.amber }}>🔥 #1 Em alta</Text>
                                </View>
                              )}
                              <Text style={{ fontSize: 12, fontWeight: '700', color: CORES.ink }} numberOfLines={2}>{livro.titulo}</Text>
                              <Text style={{ fontSize: 11, color: CORES.muted, marginTop: 2 }} numberOfLines={1}>{livro.autor}</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                {livro.media && (
                                  <Text style={{ fontSize: 10, color: CORES.amber, fontWeight: '700' }}>★ {livro.media}</Text>
                                )}
                                {livro.emprestimos > 0 && (
                                  <Text style={{ fontSize: 10, color: CORES.muted }}>{livro.emprestimos} emp.</Text>
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                );
              })()}
              {emprestimosAtivos.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>MEUS EMPRÉSTIMOS ATIVOS</Text>
                  {emprestimosAtivos
                    .filter(emp => emp.usuarioId === usuario?.id)
                    .slice(0, 2).map(emp => (
                    <View key={emp.id} style={s.loanCard}>
                      {emp.livroTitulo && emp.capa ? (
                        <Image source={{ uri: emp.capa }} style={s.loanCover} resizeMode="cover" />
                      ) : (
                        <View style={[s.loanCover, { backgroundColor: CORES.sage }]} />
                      )}
                      <View style={s.loanInfo}>
                        <Text style={s.loanTitle}>{emp.livroTitulo || `Livro #${emp.livroId}`}</Text>
                        <Text style={s.loanAuthor}>{emp.livroAutor || '—'}</Text>
                        <View style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)', marginTop: 6 }]}>
                          <Text style={[s.badgeText, { color: CORES.amber }]}>{emp.status}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              )}
              <Text style={s.sectionLabel}>ACERVO DISPONÍVEL</Text>
              {livros.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyText}>Nenhum livro no acervo ainda</Text>

                </View>
              ) : (
                <>
                  {livrosPaginadosHomeProfessor.map(livro => (
                    <TouchableOpacity key={livro.id} style={s.loanCard} onPress={() => setLivroSelecionado(livro)}>
                      {livro.capa ? (
                        <Image source={{ uri: livro.capa }} style={s.loanCover} resizeMode="cover" />
                      ) : (
                        <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
                      )}
                      <View style={s.loanInfo}>
                        <Text style={s.loanTitle}>{livro.titulo}</Text>
                        <Text style={s.loanAuthor}>{livro.autor}</Text>
                        <View style={[s.badgeSmall, { backgroundColor: livro.disponiveis > 0 ? 'rgba(74,124,89,0.12)' : 'rgba(184,76,46,0.12)' }]}>
                          <Text style={[s.badgeText, { color: livro.disponiveis > 0 ? CORES.sage : CORES.rust }]}>
                            {livro.disponiveis > 0 ? `✓ ${livro.disponiveis} disponível(is)` : '✗ Indisponível'}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: CORES.muted, fontSize: 20 }}>›</Text>
                    </TouchableOpacity>
                  ))}
                  {totalPaginasHomeProfessor > 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
                      <TouchableOpacity
                        style={[s.btnSecundario, { flex: 1, opacity: paginaHomeProfessor <= 1 ? 0.4 : 1 }]}
                        disabled={paginaHomeProfessor <= 1}
                        onPress={() => setPaginaHomeProfessor(p => p - 1)}>
                        <Text style={s.btnSecundarioText}>← Anterior</Text>
                      </TouchableOpacity>
                      <Text style={{ color: CORES.muted, fontSize: 13, minWidth: 60, textAlign: 'center' }}>
                        {paginaHomeProfessor}/{totalPaginasHomeProfessor}
                      </Text>
                      <TouchableOpacity
                        style={[s.btnSecundario, { flex: 1, opacity: paginaHomeProfessor >= totalPaginasHomeProfessor ? 0.4 : 1 }]}
                        disabled={paginaHomeProfessor >= totalPaginasHomeProfessor}
                        onPress={() => setPaginaHomeProfessor(p => p + 1)}>
                        <Text style={s.btnSecundarioText}>Próxima →</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    );

    const renderReservasProfessor = () => {
      const meusAtivos = emprestimosAtivos;
      const meuHistorico = historico;
      return (
        <ScrollView style={{ flex: 1 }}>
          <View style={s.homeHeader}>
            <View>
              <Text style={s.homeGreeting}>Minhas Reservas</Text>
              <Text style={s.homeName}>{meusAtivos.length} ativa(s)</Text>
            </View>
          </View>
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={s.sectionLabel}>EMPRÉSTIMOS ATIVOS</Text>
            {carregando ? (
              <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} />
            ) : meusAtivos.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>Nenhum empréstimo ativo</Text>
              </View>
            ) : meusAtivos.map(emp => {
              const hoje = new Date();
              const prevista = emp.dataPrevistaDevolucao
                ?? (emp.dataRetirada ? new Date(new Date(emp.dataRetirada).getTime() + 8 * 24 * 60 * 60 * 1000).toISOString() : null);
              const dataDev = prevista && emp.status === 'retirado' ? new Date(prevista) : null;
              const diasRestantes = dataDev
                ? Math.ceil((dataDev.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const atrasado = diasRestantes !== null && diasRestantes < 0;
              const urgente = diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 3;
              const capaUrl = emp.capa || livros.find(l => l.id === emp.livroId)?.capa || '';
              return (
                <View key={emp.id} style={[s.loanCard, atrasado && { borderColor: CORES.rust, borderWidth: 1.5 }]}>
                  {capaUrl ? (
                    <Image source={{ uri: capaUrl }} style={s.loanCover} resizeMode="cover" />
                  ) : (
                    <View style={[s.loanCover, { backgroundColor: CORES.sage }]} />
                  )}
                  <View style={s.loanInfo}>
                    <Text style={s.loanTitle}>{emp.livroTitulo || `Livro #${emp.livroId}`}</Text>
                    <Text style={s.loanAuthor}>{emp.livroAutor || '—'}</Text>
                    <View style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)', marginTop: 6 }]}>
                      <Text style={[s.badgeText, { color: CORES.amber }]}>
                        {emp.renovado ? '🔄 Renovado' : emp.status}
                      </Text>
                    </View>
                    {emp.dataReserva ? (
                      <Text style={[s.loanAuthor, { marginTop: 4 }]}>
                        Reservado em {new Date(emp.dataReserva).toLocaleDateString('pt-BR')}
                      </Text>
                    ) : null}
                    {dataDev ? (
                      <View style={{ marginTop: 6 }}>
                        <Text style={[s.loanAuthor, {
                          color: atrasado ? CORES.rust : urgente ? CORES.amber : CORES.sage,
                          fontWeight: '600',
                        }]}>
                          {atrasado
                            ? `⚠️ Atrasado ${Math.abs(diasRestantes!)} dia(s)`
                            : urgente
                              ? `⚠️ Vence em ${diasRestantes} dia(s)`
                              : `📅 Devolver até ${dataDev.toLocaleDateString('pt-BR')}`}
                        </Text>
                        {!atrasado && !urgente && (
                          <Text style={[s.loanAuthor, { color: CORES.muted }]}>
                            {diasRestantes} dia(s) restante(s)
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                  <View style={{ gap: 6 }}>
                    {emp.status === 'reservado' ? (
                      <TouchableOpacity
                        style={[s.btnAmber, { paddingHorizontal: 8, opacity: gerandoQrRetirada ? 0.7 : 1 }]}
                        onPress={() => handleGerarQrRetirada(emp)}
                        disabled={gerandoQrRetirada}>
                        <Text style={s.btnAmberText}>📱 QR retirada</Text>
                      </TouchableOpacity>
                    ) : null}
                    {emp.status === 'retirado' && !emp.renovado && (
                      <TouchableOpacity
                        style={[s.btnAmber, { paddingHorizontal: 8 }]}
                        onPress={() => handleRenovar(emp)}>
                        <Text style={s.btnAmberText}>🔄 Renovar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
            <Text style={[s.sectionLabel, { marginTop: 8 }]}>HISTÓRICO</Text>
            {meuHistorico.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>Nenhuma devolução registrada</Text>
              </View>
            ) : meuHistorico.map(h => (
              <View key={h.id} style={s.loanCard}>
                {h.capa ? (
                  <Image source={{ uri: h.capa }} style={s.loanCover} resizeMode="cover" />
                ) : (
                  <View style={[s.loanCover, { backgroundColor: CORES.muted }]} />
                )}
                <View style={s.loanInfo}>
                  <Text style={s.loanTitle}>{h.livroTitulo || `Livro #${h.livroId}`}</Text>
                  <Text style={s.loanAuthor}>{h.livroAutor || '—'}</Text>
                  {h.dataDevolucao ? (
                    <Text style={[s.loanAuthor, { marginTop: 4 }]}>
                      Devolvido em {new Date(h.dataDevolucao).toLocaleDateString('pt-BR')}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      );
    };

    const renderRankingProfessor = () => {
      const contagemPorAluno = new Map<string, { id: string; nome: string; turma: string; total: number }>();
      emprestimosEscola.forEach(e => {
        if (!e.usuarioId) return;
        const entry = contagemPorAluno.get(e.usuarioId);
        if (entry) {
          entry.total += 1;
        } else {
          contagemPorAluno.set(e.usuarioId, {
            id: e.usuarioId,
            nome: e.usuarioNome || 'Aluno',
            turma: e.usuarioTurma || '',
            total: 1,
          });
        }
      });
      const ranking = Array.from(contagemPorAluno.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);

      const medalhas = ['🥇', '🥈', '🥉'];

      return (
        <ScrollView style={{ flex: 1 }}>
          <View style={s.homeHeader}>
            <View>
              <Text style={s.homeGreeting}>Ranking de Leitores</Text>
              <Text style={s.homeName}>{ranking.length} aluno(s) com leituras</Text>
            </View>
          </View>
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={s.sectionLabel}>🏆 ALUNOS MAIS LEITORES DA ESCOLA</Text>
            {carregando ? (
              <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} />
            ) : ranking.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>Nenhum empréstimo registrado ainda</Text>
              </View>
            ) : ranking.map((aluno, index) => (
              <View key={aluno.id} style={[s.loanCard, index < 3 && { borderColor: CORES.amber, borderWidth: 1.5 }]}>
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: index < 3 ? CORES.amber : CORES.warm,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: index < 3 ? 22 : 16, fontWeight: '700', color: CORES.ink }}>
                    {index < 3 ? medalhas[index] : `${index + 1}º`}
                  </Text>
                </View>
                <View style={s.loanInfo}>
                  <Text style={s.loanTitle}>{aluno.nome}</Text>
                  {aluno.turma ? (
                    <Text style={s.loanAuthor}>Turma {aluno.turma}</Text>
                  ) : null}
                  <View style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)', marginTop: 4 }]}>
                    <Text style={[s.badgeText, { color: CORES.amber }]}>
                      📚 {aluno.total} {aluno.total === 1 ? 'livro lido' : 'livros lidos'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            {ranking.length > 0 && (
              <Text style={[s.loanAuthor, { textAlign: 'center', marginTop: 8, color: CORES.muted }]}>
                Baseado no total de empréstimos registrados
              </Text>
            )}
          </View>
        </ScrollView>
      );
    };

    const renderPerfilProfessor = () => (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.perfilTop}>
          <View style={s.perfilAvatar}>
            <Text style={s.perfilAvatarText}>{usuario?.iniciais}</Text>
          </View>
          <Text style={s.perfilName}>{usuario?.nome}</Text>
          <Text style={s.perfilSub}>{usuario?.email}</Text>
          <View style={s.perfilBadge}>
            <Text style={s.perfilBadgeTitle}>{BIBLIOTECA}</Text>
            <Text style={s.perfilBadgeSub}>{ESCOLA}</Text>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <View style={s.statsRow}>
            {[
              { num: emprestimosAtivos.filter(e => e.usuarioId === usuario?.id).length, label: 'Meus\nempréstimos' },
              { num: historico.filter(h => h.usuarioId === usuario?.id).length, label: 'Total\nlidos' },
              { num: emprestimosAtivos.length, label: 'Ativos\nna escola' },
            ].map((st, i) => (
              <View key={i} style={s.statCard}>
                <Text style={s.statNum}>{st.num}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
          {[
            { icon: '📚', title: 'Meu histórico', sub: `${historico.filter(h => h.usuarioId === usuario?.id).length} livros lidos` },
            { icon: '🔔', title: 'Notificações', sub: 'Configurar alertas' },
            { icon: '✏️', title: 'Editar perfil', sub: 'Atualizar informações' },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={s.menuItem}>
              <View style={s.menuIcon}><Text style={{ fontSize: 18 }}>{item.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuTitle}>{item.title}</Text>
                <Text style={s.menuSub}>{item.sub}</Text>
              </View>
              <Text style={s.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Text style={s.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteAccountBtn} onPress={handleExcluirConta}>
            <Text style={s.deleteAccountText}>Excluir minha conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );

    const abasProfessor = [
      { key: 'home', icon: '🏠', label: 'Início' },
      { key: 'buscar', icon: '🔍', label: 'Explorar' },
      { key: 'reservas', icon: '📋', label: 'Reservas' },
      { key: 'ranking', icon: '🏆', label: 'Ranking' },
      { key: 'avisos', icon: '🔔', label: 'Avisos' },
      { key: 'perfil', icon: '👤', label: 'Perfil' },
    ];

    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1 }}>
          {abaProfessor === 'home' && !livroSelecionado && renderHomeProfessor()}
          {abaProfessor === 'home' && livroSelecionado && renderDetalhe()}
          {abaProfessor === 'buscar' && !livroSelecionado && renderBusca()}
          {abaProfessor === 'buscar' && livroSelecionado && renderDetalhe()}
          {abaProfessor === 'reservas' && renderReservasProfessor()}
          {abaProfessor === 'ranking' && renderRankingProfessor()}
          {abaProfessor === 'avisos' && renderNotificacoes()}
          {abaProfessor === 'perfil' && renderPerfilProfessor()}
        </View>
        <View style={s.tabBar}>
          {abasProfessor.map(aba => {
            const naoLidos = comunicados.filter(c => !comunicadosLidos.has(c.id)).length;
            return (
              <TouchableOpacity key={aba.key} style={s.tabItem}
                onPress={() => {
                  const novaAba = aba.key as AbaProfessor;
                  setAbaProfessor(novaAba);
                  setLivroSelecionado(null);
                  if (novaAba === 'avisos') setComunicadosLidos(new Set(comunicados.map(c => c.id)));
                }}>
                <View style={{ position: 'relative' }}>
                  <Text style={{ fontSize: 20 }}>{aba.icon}</Text>
                  {aba.key === 'avisos' && naoLidos > 0 && (
                    <View style={s.tabBadge}>
                      <Text style={s.tabBadgeText}>{naoLidos > 9 ? '9+' : naoLidos}</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.tabLabel, abaProfessor === aba.key && { color: CORES.amber, fontWeight: '600' }]}>
                  {aba.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    );
  }

  // ── TELA DO ALUNO ──
  const abas = [
    { key: 'home',   icon: '🏠', label: 'Início'   },
    { key: 'buscar', icon: '🔍', label: 'Explorar' },
    { key: 'livros', icon: '📋', label: 'Reservas' },
    { key: 'avisos', icon: '🔔', label: 'Avisos'   },
    { key: 'perfil', icon: '👤', label: 'Perfil'   },
  ];

  return (
    <SafeAreaView style={s.container}>
      <View style={{ flex: 1 }}>
        {abaAtiva === 'home'   && !livroSelecionado && renderHome()}
        {abaAtiva === 'home'   &&  livroSelecionado && renderDetalhe()}
        {abaAtiva === 'buscar' && !livroSelecionado && renderBusca()}
        {abaAtiva === 'buscar' &&  livroSelecionado && renderDetalhe()}
        {abaAtiva === 'livros' &&  telaQrRetirada   && renderQrRetirada()}
        {abaAtiva === 'livros' && !telaQrRetirada && !telaResenha && renderMeusLivros()}
        {abaAtiva === 'livros' && !telaQrRetirada &&  telaResenha && renderEscreverResenha()}
        {abaAtiva === 'perfil' &&  telaListaDesejos && renderListaDesejos()}
        {abaAtiva === 'perfil' && !telaListaDesejos && renderPerfil()}
        {abaAtiva === 'avisos' && renderNotificacoes()}
      </View>
      <View style={s.tabBar}>
        {abas.map(aba => {
          const naoLidos = comunicados.filter(c => !comunicadosLidos.has(c.id)).length;
          return (
            <TouchableOpacity key={aba.key} style={s.tabItem}
              onPress={() => {
                setAbaAtiva(aba.key as AbaUsuario);
                setLivroSelecionado(null);
                setTelaListaDesejos(false);
                setTelaQrRetirada(false);
                setTelaHistorico(false);
                setTelaComunicadosPerfil(false);
                if (aba.key === 'avisos') setComunicadosLidos(new Set(comunicados.map(c => c.id)));
              }}>
              <View style={{ position: 'relative' }}>
                <Text style={{ fontSize: 20 }}>{aba.icon}</Text>
                {aba.key === 'avisos' && naoLidos > 0 && (
                  <View style={s.tabBadge}>
                    <Text style={s.tabBadgeText}>{naoLidos > 9 ? '9+' : naoLidos}</Text>
                  </View>
                )}
              </View>
              <Text style={[s.tabLabel, abaAtiva === aba.key && { color: CORES.amber, fontWeight: '600' }]}>
                {aba.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
