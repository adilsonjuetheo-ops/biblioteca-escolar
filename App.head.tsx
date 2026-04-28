import { useState } from 'react';
import axios from 'axios';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, SafeAreaView, ScrollView,
  ActivityIndicator, Image
} from 'react-native';

const API_URL = 'http://192.168.1.8:3001';

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
const ESCOLA = 'E. E. Cel. José Venâncio de Souza';
const BIBLIOTECA = 'Biblioteca Marlene de Souza Queiroz';

export default function App() {
  const [tela, setTela] = useState('login');
  const [abaAtiva, setAbaAtiva] = useState('home');
  const [abaBiblio, setAbaBiblio] = useState('dashboard');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [usuario, setUsuario] = useState<any>(null);
  const [livros, setLivros] = useState<any[]>([]);
  const [emprestimosAtivos, setEmprestimosAtivos] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [livroSelecionado, setLivroSelecionado] = useState<any>(null);
  const [buscaTexto, setBuscaTexto] = useState('');
  const [filtroGenero, setFiltroGenero] = useState('todos');
  const [filtroDisp, setFiltroDisp] = useState('todos');

  const [todasAvaliacoes, setTodasAvaliacoes] = useState<any[]>([]);
  const [telaResenha, setTelaResenha] = useState(false);
  const [livroParaResenhar, setLivroParaResenhar] = useState<any>(null);
  const [notaResenha, setNotaResenha] = useState(0);
  const [textoResenha, setTextoResenha] = useState('');
  const [enviandoResenha, setEnviandoResenha] = useState(false);

  const [desejos, setDesejos] = useState<any[]>([]);
  const [telaListaDesejos, setTelaListaDesejos] = useState(false);
  const [togglendoDesejo, setTogglendoDesejo] = useState<string | null>(null);

  const [cadNome, setCadNome] = useState('');
  const [cadEmail, setCadEmail] = useState('');
  const [cadSenha, setCadSenha] = useState('');
  const [cadMatricula, setCadMatricula] = useState('');
  const [cadTurma, setCadTurma] = useState('');

  const [profNome, setProfNome] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profSenha, setProfSenha] = useState('');
  const [profDisciplina, setProfDisciplina] = useState('');
  const [profCargo, setProfCargo] = useState('professor');

  const [recEmail, setRecEmail] = useState('');
  const [recCodigo, setRecCodigo] = useState('');
  const [recNovaSenha, setRecNovaSenha] = useState('');
  const [recConfirmarSenha, setRecConfirmarSenha] = useState('');
  const [recEtapa, setRecEtapa] = useState<'email' | 'codigo'>('email');
  const [recMensagem, setRecMensagem] = useState('');
  const [recLoading, setRecLoading] = useState(false);

  const livrosFiltrados = livros.filter(livro => {
    const textoOk = livro.titulo?.toLowerCase().includes(buscaTexto.toLowerCase()) ||
      livro.autor?.toLowerCase().includes(buscaTexto.toLowerCase());
    const generoOk = filtroGenero === 'todos' || livro.genero === filtroGenero;
    const dispOk = filtroDisp === 'todos' ||
      (filtroDisp === 'disponivel' && livro.disponiveis > 0) ||
      (filtroDisp === 'indisponivel' && livro.disponiveis === 0);
    return textoOk && generoOk && dispOk;
  });

  const generosUnicos = ['todos', ...Array.from(new Set(livros.map((l: any) => l.genero).filter(Boolean)))];

  async function carregarDados() {
    try {
      setCarregando(true);
      const uid = usuario?.id;
      const [resLivros, resEmp, resAvaliacoes, resDesejos] = await Promise.all([
        axios.get(`${API_URL}/livros`),
        axios.get(`${API_URL}/emprestimos`),
        axios.get(`${API_URL}/avaliacoes`),
        uid ? axios.get(`${API_URL}/desejos?usuarioId=${uid}`) : Promise.resolve({ data: [] }),
      ]);
      setLivros(resLivros.data);
      setEmprestimosAtivos(resEmp.data.filter((e: any) => e.status === 'reservado' || e.status === 'retirado'));
      setHistorico(resEmp.data.filter((e: any) => e.status === 'devolvido'));
      setTodasAvaliacoes(resAvaliacoes.data);
      setDesejos(resDesejos.data);
    } catch {
      Alert.alert('Erro', 'Não foi possível conectar ao servidor.');
    } finally {
      setCarregando(false);
    }
  }

  async function handleLogin() {
    setErro('');
    if (!email || !senha) { setErro('Preencha todos os campos.'); return; }
    if (!email.endsWith(DOMINIO_ALUNO) && !email.endsWith(DOMINIO_PROFESSOR)) {
      setErro('Use seu e-mail escolar institucional'); return;
    }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/usuarios/login`, { email, senha });
      const iniciais = data.nome.split(' ').map((p: string) => p[0].toUpperCase()).join('').slice(0, 2);
      setUsuario({ ...data, iniciais });
      if (data.perfil === 'aluno') {
        setTela('main'); setAbaAtiva('home');
      } else {
        setTela('bibliotecario'); setAbaBiblio('dashboard');
      }
      await carregarDados();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'E-mail ou senha incorretos');
    } finally {
      setLoading(false);
    }
  }

  async function handleCadastroAluno() {
    if (!cadNome || !cadEmail || !cadSenha || !cadMatricula || !cadTurma) {
      Alert.alert('Atenção', 'Preencha todos os campos.'); return;
    }
    if (!cadEmail.endsWith(DOMINIO_ALUNO)) {
      Alert.alert('E-mail inválido', `Use ${DOMINIO_ALUNO}`); return;
    }
    if (cadSenha.length < 6) {
      Alert.alert('Senha fraca', 'Mínimo 6 caracteres.'); return;
    }
    try {
      const { data } = await axios.post(`${API_URL}/usuarios`, {
        nome: cadNome, email: cadEmail, senha: cadSenha,
        matricula: cadMatricula, turma: cadTurma, perfil: 'aluno',
      });
      Alert.alert('Cadastro realizado!', `Bem-vindo(a), ${data.nome}!`, [
        { text: 'Fazer login', onPress: () => {
          setTela('login');
          setCadNome(''); setCadEmail(''); setCadSenha('');
          setCadMatricula(''); setCadTurma('');
        }}
      ]);
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.erro || 'Não foi possível cadastrar.');
    }
  }

  async function handleCadastroProfessor() {
    if (!profNome || !profEmail || !profSenha || !profDisciplina) {
      Alert.alert('Atenção', 'Preencha todos os campos.'); return;
    }
    if (!profEmail.endsWith(DOMINIO_PROFESSOR)) {
      Alert.alert('E-mail inválido', `Use ${DOMINIO_PROFESSOR}`); return;
    }
    if (profSenha.length < 6) {
      Alert.alert('Senha fraca', 'Mínimo 6 caracteres.'); return;
    }
    try {
      const { data } = await axios.post(`${API_URL}/usuarios`, {
        nome: profNome, email: profEmail, senha: profSenha,
        matricula: profDisciplina, perfil: profCargo,
      });
      Alert.alert('Cadastro realizado!', `Professor(a) ${data.nome} cadastrado(a)!`, [
        { text: 'Fazer login', onPress: () => {
          setTela('login');
          setProfNome(''); setProfEmail(''); setProfSenha('');
          setProfDisciplina(''); setProfCargo('professor');
        }}
      ]);
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.erro || 'Não foi possível cadastrar.');
    }
  }

  async function handleReserva(livro: any) {
    if (livro.disponiveis === 0) {
      Alert.alert('Indisponível', 'Sem exemplares disponíveis.'); return;
    }
    try {
      await axios.post(`${API_URL}/emprestimos`, { usuarioId: usuario.id, livroId: livro.id });
      Alert.alert('Reserva confirmada!', `"${livro.titulo}" reservado!`);
      await carregarDados();
      setLivroSelecionado(null);
    } catch {
      Alert.alert('Erro', 'Não foi possível reservar.');
    }
  }

  async function handleDevolucao(emp: any) {
    try {
      await axios.patch(`${API_URL}/emprestimos/${emp.id}/devolver`);
      Alert.alert('Devolução registrada!', 'Livro devolvido com sucesso.');
      await carregarDados();
    } catch {
      Alert.alert('Erro', 'Não foi possível registrar devolução.');
    }
  }
  async function handleRenovar(emp: any) {
  Alert.alert(
    'Renovar empréstimo',
    `Deseja renovar "${emp.livroTitulo}"? O prazo será estendido por mais 14 dias.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Renovar',
        onPress: async () => {
          try {
            await axios.patch(`${API_URL}/emprestimos/${emp.id}/renovar`);
            Alert.alert('Renovado!', 'Prazo estendido por mais 14 dias.');
            await carregarDados();
          } catch (err: any) {
            Alert.alert('Erro', err.response?.data?.erro || 'Não foi possível renovar.');
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
      await axios.post(`${API_URL}/avaliacoes`, {
        usuarioId: usuario.id,
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
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.erro || 'Não foi possível enviar a avaliação.');
    } finally {
      setEnviandoResenha(false);
    }
  }

    async function handleToggleDesejo(livro: any) {
      const existente = desejos.find(d => d.livroId === livro.id);
      setTogglendoDesejo(livro.id);
      try {
        if (existente) {
          await axios.delete(`${API_URL}/desejos/${existente.id}`);
          setDesejos(prev => prev.filter(d => d.id !== existente.id));
        } else {
          const { data } = await axios.post(`${API_URL}/desejos`, {
            usuarioId: usuario.id,
            livroId: livro.id,
          });
          setDesejos(prev => [...prev, data]);
        }
      } catch (err: any) {
        Alert.alert('Erro', err.response?.data?.erro || 'Não foi possível atualizar a lista de desejos.');
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
      const { data } = await axios.post(`${API_URL}/usuarios/recuperar-senha`, { email: emailNormalizado });
      setRecEtapa('codigo');
      setRecMensagem(data?.mensagem || 'Código enviado. Confira seu e-mail institucional.');

      // Suporte para ambiente de desenvolvimento quando a API retorna o código diretamente.
      if (data?.codigo) {
        Alert.alert('Código de recuperação (teste)', `Use o código: ${data.codigo}`);
      }
    } catch (err: any) {
      setRecMensagem(err.response?.data?.erro || 'Não foi possível enviar o código de recuperação.');
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
      await axios.post(`${API_URL}/usuarios/redefinir-senha`, {
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
    } catch (err: any) {
      setRecMensagem(err.response?.data?.erro || 'Não foi possível redefinir a senha.');
    } finally {
      setRecLoading(false);
    }
  }

  function handleLogout() {
    Alert.alert('Sair', 'Deseja sair da conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => {
        setTela('login'); setEmail(''); setSenha(''); setErro('');
        setLivros([]); setEmprestimosAtivos([]); setHistorico([]);
        setTodasAvaliacoes([]); setTelaResenha(false); setLivroParaResenhar(null);
        setDesejos([]); setTelaListaDesejos(false);
        setUsuario(null);
      }}
    ]);
  }

  // ── LOGIN ──
  if (tela === 'login') {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.loginBox}>
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
              secureTextEntry={!mostrarSenha} />
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
            <Text style={[s.btnSecundarioText, { color: CORES.sage }]}>📖  Cadastro de professor / bibliotecário</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (tela === 'esqueci') {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.loginBox}>
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
    );
  }

  if (tela === 'cadastroAluno') {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
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
            value={cadSenha} onChangeText={setCadSenha} secureTextEntry />
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
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setTela('login')} style={s.voltarBtn}>
            <Text style={s.voltarText}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={s.paginaTitulo}>Cadastro de professor</Text>
          <Text style={s.paginaSub}>📖 Professores e bibliotecários · {DOMINIO_PROFESSOR}</Text>
          <Text style={s.label}>Nome completo *</Text>
          <TextInput style={s.input} placeholder="Seu nome completo"
            placeholderTextColor={CORES.muted}
            value={profNome} onChangeText={setProfNome} autoCapitalize="words" />
          <Text style={s.label}>E-mail institucional *</Text>
          <TextInput style={s.input} placeholder={`nome${DOMINIO_PROFESSOR}`}
            placeholderTextColor={CORES.muted}
            value={profEmail} onChangeText={setProfEmail}
            keyboardType="email-address" autoCapitalize="none" />
          <Text style={s.label}>Disciplina / Função *</Text>
          <TextInput style={s.input} placeholder="Ex: Português, Bibliotecário(a)"
            placeholderTextColor={CORES.muted}
            value={profDisciplina} onChangeText={setProfDisciplina} autoCapitalize="words" />
          <Text style={s.label}>Cargo</Text>
          <View style={s.radioRow}>
            {[
              { key: 'professor', label: 'Professor' },
              { key: 'bibliotecario', label: 'Bibliotecário' },
              { key: 'coordenacao', label: 'Coordenação' },
            ].map(c => (
              <TouchableOpacity key={c.key}
                style={[s.radioBtn, profCargo === c.key && s.radioBtnAtivo]}
                onPress={() => setProfCargo(c.key)}>
                <Text style={[s.radioText, profCargo === c.key && s.radioTextAtivo]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
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

  // ── PAINEL BIBLIOTECÁRIO ──
  if (tela === 'bibliotecario') {
    const renderDashboard = () => (
      <ScrollView style={{ flex: 1 }}>
        <View style={s.homeHeader}>
          <View>
            <Text style={s.homeGreeting}>Painel do Bibliotecário</Text>
            <Text style={s.homeName}>{usuario?.nome}</Text>
          </View>
          <View style={s.homeAvatarSmall}>
            <Text style={s.homeAvatarText}>{usuario?.iniciais}</Text>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          {carregando ? <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} /> : (
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
              <Text style={s.sectionLabel}>EMPRÉSTIMOS ATIVOS</Text>
              {emprestimosAtivos.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyText}>Nenhum empréstimo ativo</Text>
                </View>
              ) : emprestimosAtivos.map(emp => (
                <View key={emp.id} style={s.loanCard}>
  <View style={[s.loanCover, { backgroundColor: CORES.sage }]} />
  <View style={s.loanInfo}>
    <Text style={s.loanTitle}>{emp.livroTitulo || `Livro #${emp.livroId}`}</Text>
    <Text style={s.loanAuthor}>{emp.usuarioNome || `Usuário #${emp.usuarioId}`}</Text>
    {emp.usuarioTurma ? (
      <Text style={[s.loanAuthor, { color: CORES.amber }]}>Turma {emp.usuarioTurma}</Text>
    ) : null}
    <View style={[s.badgeSmall, { backgroundColor: 'rgba(201,123,46,0.12)', marginTop: 6 }]}>
      <Text style={[s.badgeText, { color: CORES.amber }]}>{emp.status}</Text>
    </View>
  </View>
  <TouchableOpacity style={s.btnAmber} onPress={() => handleDevolucao(emp)}>
    <Text style={s.btnAmberText}>Devolver</Text>
  </TouchableOpacity>
</View>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    );

    const renderAcervo = () => (
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
            ) : livros.map(livro => (
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
            ))
          }
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
        </View>
      </ScrollView>
    );

    const abasBiblio = [
      { key: 'dashboard', icon: '📊', label: 'Painel' },
      { key: 'acervo', icon: '📚', label: 'Acervo' },
      { key: 'perfil', icon: '👤', label: 'Perfil' },
    ];

    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1 }}>
          {abaBiblio === 'dashboard' && renderDashboard()}
          {abaBiblio === 'acervo' && renderAcervo()}
          {abaBiblio === 'perfil' && renderPerfilBiblio()}
        </View>
        <View style={s.tabBar}>
          {abasBiblio.map(aba => (
            <TouchableOpacity key={aba.key} style={s.tabItem} onPress={() => setAbaBiblio(aba.key)}>
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

  // ── TELAS DO ALUNO ──
  const renderDetalhe = () => (
    <ScrollView style={{ flex: 1 }}>
      <View style={s.homeHeader}>
        <TouchableOpacity onPress={() => setLivroSelecionado(null)} style={{ marginRight: 12 }}>
          <Text style={{ color: CORES.amberLt, fontSize: 16, fontWeight: '700' }}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={[s.homeGreeting, { flex: 1 }]}>Detalhes do livro</Text>
        {(() => {
          const noDesejo = desejos.find(d => d.livroId === livroSelecionado?.id);
          const carregando = togglendoDesejo === livroSelecionado?.id;
          return (
            <TouchableOpacity
              onPress={() => livroSelecionado && handleToggleDesejo(livroSelecionado)}
              disabled={carregando}
              style={{ padding: 4 }}>
              <Text style={{ fontSize: 24, opacity: carregando ? 0.4 : 1 }}>
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
            { label: 'Prazo', valor: '14 dias' },
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
          {livroSelecionado?.disponiveis > 0 ? (
            <TouchableOpacity style={s.btnDetalheReserva} onPress={() => handleReserva(livroSelecionado)}>
              <Text style={s.btnDetalheReservaText}>✓ Confirmar reserva</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.btnDetalheReserva, { backgroundColor: CORES.muted }]}
              onPress={() => Alert.alert('Fila de espera', 'Você entrou na fila! Será avisado quando disponível.')}>
              <Text style={s.btnDetalheReservaText}>🔔 Entrar na fila de espera</Text>
            </TouchableOpacity>
          )}
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
    </ScrollView>
  );

  const renderHome = () => (
    <ScrollView style={{ flex: 1 }}>
      <View style={s.homeHeader}>
        <View>
          <Text style={s.homeGreeting}>Bom dia 👋</Text>
          <Text style={s.homeName}>{usuario?.nome}</Text>
        </View>
        <View style={s.homeAvatarSmall}>
          <Text style={s.homeAvatarText}>{usuario?.iniciais}</Text>
        </View>
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={s.searchBar}>
          <Text style={{ fontSize: 14, marginRight: 6 }}>🔍</Text>
          <Text style={s.searchPlaceholder}>Buscar livros, autores...</Text>
        </View>
        {carregando ? <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} /> : (
          <>
            {emprestimosAtivos.length > 0 && (
              <>
                <Text style={s.sectionLabel}>MEU EMPRÉSTIMO ATIVO</Text>
                {emprestimosAtivos.slice(0, 1).map(emp => (
                  <View key={emp.id} style={s.loanCard}>
                    <View style={[s.loanCover, { backgroundColor: CORES.sage }]} />
                    <View style={s.loanInfo}>
                      <Text style={s.loanTitle}>Empréstimo #{emp.id}</Text>
                      <Text style={s.loanAuthor}>Status: {emp.status}</Text>
                      <View style={s.progressBar}>
                        <View style={[s.progressFill, { width: '70%' }]} />
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
            ) : livros.map(livro => (
              <TouchableOpacity key={livro.id} style={s.loanCard} onPress={() => setLivroSelecionado(livro)}>
                <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
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
          </>
        )}
      </View>
    </ScrollView>
  );

  const renderBusca = () => (
    <ScrollView style={{ flex: 1 }}>
      <View style={s.homeHeader}>
        <View>
          <Text style={s.homeGreeting}>Explorar acervo</Text>
          <Text style={s.homeName}>{livrosFiltrados.length} livros</Text>
        </View>
      </View>
      <View style={{ padding: 16 }}>
        <TextInput style={[s.input, { marginBottom: 12 }]}
          placeholder="🔍  Buscar por título ou autor..."
          placeholderTextColor={CORES.muted}
          value={buscaTexto} onChangeText={setBuscaTexto} />
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {generosUnicos.map((g: any) => (
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
        {carregando ? (
          <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} />
        ) : livrosFiltrados.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>Nenhum livro encontrado{'\n'}Tente outros filtros</Text>
          </View>
        ) : livrosFiltrados.map(livro => (
          <TouchableOpacity key={livro.id} style={s.loanCard} onPress={() => setLivroSelecionado(livro)}>
            <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
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
      </View>
    </ScrollView>
  );

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
     {emprestimosAtivos.map(emp => (
  <View key={emp.id} style={s.loanCard}>
    <View style={[s.loanCover, { backgroundColor: CORES.sage }]} />
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
    </View>
    {emp.status === 'retirado' && !emp.renovado && (
      <TouchableOpacity
        style={[s.btnAmber, { paddingHorizontal: 8 }]}
        onPress={() => handleRenovar(emp)}>
        <Text style={s.btnAmberText}>🔄 Renovar</Text>
      </TouchableOpacity>
    )}
  </View>
))}

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
          return (
            <View key={d.id} style={s.loanCard}>
              {d.livroCapa ? (
                <Image source={{ uri: d.livroCapa }} style={s.loanCover} resizeMode="cover" />
              ) : (
                <View style={[s.loanCover, { backgroundColor: CORES.ink }]} />
              )}
              <View style={s.loanInfo}>
                <Text style={s.loanTitle}>{d.livroTitulo}</Text>
                <Text style={s.loanAuthor}>{d.livroAutor || '—'}</Text>
                {d.livroGenero ? (
                  <Text style={[s.loanAuthor, { color: CORES.amber }]}>{d.livroGenero}</Text>
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

  const renderPerfil = () => (
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
      </View>
      <View style={{ padding: 16 }}>
        {[
          { icon: '📚', title: 'Histórico de Empréstimos', sub: `${historico.length} livros lidos` },
          { icon: '🤍', title: 'Minha Lista de Desejos', sub: `${desejos.length} título(s) salvos` },
          { icon: '🔔', title: 'Notificações', sub: 'Configurar alertas' },
          { icon: '✏️', title: 'Editar perfil', sub: 'Atualizar informações' },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={s.menuItem}
            onPress={i === 1 ? () => setTelaListaDesejos(true) : undefined}>
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
      </View>
    </ScrollView>
  );

  const abas = [
    { key: 'home', icon: '🏠', label: 'Início' },
    { key: 'buscar', icon: '🔍', label: 'Explorar' },
    { key: 'livros', icon: '📋', label: 'Reservas' },
    { key: 'perfil', icon: '👤', label: 'Perfil' },
  ];

  return (
    <SafeAreaView style={s.container}>
      <View style={{ flex: 1 }}>
        {abaAtiva === 'home' && !livroSelecionado && renderHome()}
        {abaAtiva === 'home' && livroSelecionado && renderDetalhe()}
        {abaAtiva === 'buscar' && !livroSelecionado && renderBusca()}
        {abaAtiva === 'buscar' && livroSelecionado && renderDetalhe()}
        {abaAtiva === 'livros' && !telaResenha && renderMeusLivros()}
        {abaAtiva === 'livros' && telaResenha && renderEscreverResenha()}
        {abaAtiva === 'perfil' && telaListaDesejos && renderListaDesejos()}
        {abaAtiva === 'perfil' && !telaListaDesejos && renderPerfil()}
      </View>
      <View style={s.tabBar}>
        {abas.map(aba => (
          <TouchableOpacity key={aba.key} style={s.tabItem} onPress={() => { setAbaAtiva(aba.key); setLivroSelecionado(null); setTelaListaDesejos(false); }}>
            <Text style={{ fontSize: 20 }}>{aba.icon}</Text>
            <Text style={[s.tabLabel, abaAtiva === aba.key && { color: CORES.amber, fontWeight: '600' }]}>
              {aba.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
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
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CORES.border, gap: 12 },
  menuIcon: { width: 36, height: 36, backgroundColor: CORES.warm, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 14, fontWeight: '600', color: CORES.ink },
  menuSub: { fontSize: 12, color: CORES.muted, marginTop: 1 },
  menuArrow: { color: CORES.muted, fontSize: 20 },
  logoutBtn: { marginTop: 20, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: CORES.amber, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: CORES.amber, fontSize: 15, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: CORES.card, borderTopWidth: 1, borderTopColor: CORES.border, paddingBottom: 4 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabLabel: { fontSize: 10, color: CORES.muted, fontWeight: '500' },
  resenhaJaCard: { backgroundColor: CORES.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: CORES.border, marginTop: 4 },
  resenhaTexto: { fontSize: 14, color: CORES.ink, fontStyle: 'italic', lineHeight: 22, marginTop: 6 },
  avaliacaoCard: { backgroundColor: CORES.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: CORES.border, marginBottom: 10 },
  avaliacaoNome: { fontSize: 13, fontWeight: '700', color: CORES.ink },
  avaliacaoMediaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: CORES.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: CORES.border, marginBottom: 12 },
  avaliacaoMediaNum: { fontSize: 40, fontWeight: '700', color: CORES.amber },
});