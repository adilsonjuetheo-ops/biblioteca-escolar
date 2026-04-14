import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Platform, Keyboard,
} from 'react-native';

const CORES = {
  ink: '#1a1208', parch: '#f5efe3', warm: '#e8dcc8',
  amber: '#c97b2e', amberLt: '#f0a84a', sage: '#4a7c59',
  rust: '#b84c2e', muted: '#8a7d68', card: '#fdfaf4', border: '#d9cfbe',
};

// ← aponta para sua própria API, não para a Anthropic diretamente
const API_URL = 'https://bibliotecaapi-production-7ee0.up.railway.app/api/marlene';

type Livro = {
  id: string; titulo: string; autor?: string; genero?: string;
  sinopse?: string; disponiveis?: number; totalExemplares?: number;
};
type Mensagem = { role: 'user' | 'assistant'; content: string; };
type Props = { livro: Livro; acervo?: Livro[]; token?: string; onFechar: () => void; };

function buildSystemPrompt(livro: Livro, acervo: Livro[]): string {
  const acervoResumido = acervo.slice(0, 30).map(l =>
    `- "${l.titulo}"${l.autor ? ` de ${l.autor}` : ''}${l.genero ? ` (${l.genero})` : ''}${(l.disponiveis ?? 0) > 0 ? ' ✓ disponível' : ' ✗ indisponível'}`
  ).join('\n');

  return `Você é a Marlene, a assistente virtual da Biblioteca Marlene de Souza Queiroz da E. E. Cel. José Venâncio de Souza.

Sua personalidade:
- Divertida, jovem e descontraída — fala como uma amiga que ama livros
- Usa linguagem acessível para alunos do ensino médio
- Entusiasmada com leitura, sem ser chata ou formal demais
- Usa emojis com moderação para deixar a conversa mais leve
- Nunca inventa informações — se não sabe, diz claramente

Suas especialidades:
- Recomendações de livros por gênero, humor ou interesse
- Informações sobre empréstimos (prazo de 8 dias, renovação única de mais 5 dias)
- Sinopses e curiosidades sobre livros do acervo
- Dicas de leitura e curiosidades literárias

Regras:
- Você está na tela do livro "${livro.titulo}"${livro.autor ? ` de ${livro.autor}` : ''}
- Só fale sobre livros e biblioteca
- Respostas curtas — no máximo 3 parágrafos

Livro atual:
Título: ${livro.titulo}
${livro.autor ? `Autor: ${livro.autor}` : ''}
${livro.genero ? `Gênero: ${livro.genero}` : ''}
${livro.sinopse ? `Sinopse: ${livro.sinopse}` : ''}
Disponibilidade: ${(livro.disponiveis ?? 0) > 0 ? `${livro.disponiveis} exemplar(es) disponível(is)` : 'Indisponível'}

Acervo da biblioteca:
${acervoResumido || 'Acervo não disponível.'}`;
}

export default function MarleneChat({ livro, acervo = [], token, onFechar }: Props) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      role: 'assistant',
      content: `Oi! 👋 Sou a Marlene, sua guia literária aqui na biblioteca! Vi que você está olhando "${livro.titulo}"${livro.autor ? ` do ${livro.autor}` : ''} — ótima escolha! 📚\n\nPosso te ajudar com recomendações, tirar dúvidas sobre empréstimos ou contar mais sobre esse livro. O que você quer saber?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [carregando, setCarregando] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;  // entrada: começa 60px abaixo
  const kbAnim = useRef(new Animated.Value(0)).current;      // teclado: eleva o container

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: false }),
    ]).start();
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => Animated.timing(kbAnim, { toValue: e.endCoordinates.height, duration: 250, useNativeDriver: false }).start()
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => Animated.timing(kbAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start()
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [mensagens]);

  async function enviarMensagem() {
    const texto = input.trim();
    if (!texto || carregando) return;

    const novasMensagens: Mensagem[] = [...mensagens, { role: 'user', content: texto }];
    setMensagens(novasMensagens);
    setInput('');
    setCarregando(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          system: buildSystemPrompt(livro, acervo),
          messages: novasMensagens.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const resposta = data?.resposta || 'Desculpa, não consegui responder agora. Tenta de novo! 😅';
      setMensagens(prev => [...prev, { role: 'assistant', content: resposta }]);
    } catch (err) {
      console.error('Erro Marlene:', err);
      setMensagens(prev => [...prev, {
        role: 'assistant',
        content: 'Ops, tive um probleminha técnico! 😅 Tenta de novo em instantes.',
      }]);
    } finally {
      setCarregando(false);
    }
  }

  const sugestoes = [
    'Me conta mais sobre esse livro',
    'Tem livros parecidos?',
    'Como funciona o empréstimo?',
    'Me recomenda algo',
  ];

  return (
    <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
      <Animated.View style={[s.container, { bottom: kbAnim }]}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.avatar}>
              <Text style={s.avatarEmoji}>📚</Text>
            </View>
            <View>
              <Text style={s.headerNome}>Marlene</Text>
              <Text style={s.headerSub}>Assistente da Biblioteca</Text>
            </View>
          </View>
          <TouchableOpacity style={s.fecharBtn} onPress={onFechar}>
            <Text style={s.fecharText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          style={s.mensagensArea}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}>
          {mensagens.map((msg, i) => (
            <View key={i} style={[s.msgRow, msg.role === 'user' && s.msgRowUser]}>
              {msg.role === 'assistant' && (
                <View style={s.msgAvatar}>
                  <Text style={{ fontSize: 14 }}>📚</Text>
                </View>
              )}
              <View style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleBot]}>
                <Text style={[s.bubbleText, msg.role === 'user' && s.bubbleTextUser]}>
                  {msg.content}
                </Text>
              </View>
            </View>
          ))}
          {carregando && (
            <View style={s.msgRow}>
              <View style={s.msgAvatar}>
                <Text style={{ fontSize: 14 }}>📚</Text>
              </View>
              <View style={s.bubbleBot}>
                <View style={s.typingDots}>
                  <ActivityIndicator size="small" color={CORES.amber} />
                  <Text style={s.typingText}>Marlene está digitando...</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {mensagens.length === 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.sugestoesArea}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {sugestoes.map((sug, i) => (
              <TouchableOpacity
                key={i}
                style={s.sugestaoBtn}
                onPress={() => setInput(sug)}>
                <Text style={s.sugestaoText}>{sug}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={s.inputArea}>
            <TextInput
              style={s.input}
              placeholder="Pergunte para a Marlene..."
              placeholderTextColor={CORES.muted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={enviarMensagem}
              returnKeyType="send"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[s.enviarBtn, (!input.trim() || carregando) && s.enviarBtnDisabled]}
              onPress={enviarMensagem}
              disabled={!input.trim() || carregando}>
              <Text style={s.enviarIcon}>➤</Text>
            </TouchableOpacity>
          </View>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,18,8,0.5)',
    zIndex: 999,
  },
  container: {
    position: 'absolute',
    left: 0, right: 0,
    top: '20%',
    backgroundColor: CORES.parch,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: CORES.border,
    backgroundColor: CORES.ink,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: CORES.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 20 },
  headerNome: { fontSize: 16, fontWeight: '700', color: CORES.parch },
  headerSub: { fontSize: 11, color: 'rgba(245,239,227,0.5)', marginTop: 1 },
  fecharBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(245,239,227,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  fecharText: { color: CORES.parch, fontSize: 14, fontWeight: '600' },
  mensagensArea: { flex: 1 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  msgRowUser: { flexDirection: 'row-reverse' },
  msgAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: CORES.warm,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  bubbleBot: {
    backgroundColor: CORES.card,
    borderWidth: 1,
    borderColor: CORES.border,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: CORES.amber,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, color: CORES.ink, lineHeight: 21 },
  bubbleTextUser: { color: CORES.ink, fontWeight: '500' },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 12, color: CORES.muted },
  sugestoesArea: { maxHeight: 48, marginBottom: 8 },
  sugestaoBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
    borderColor: CORES.amber,
    backgroundColor: 'rgba(201,123,46,0.06)',
  },
  sugestaoText: { fontSize: 12, color: CORES.amber, fontWeight: '600' },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CORES.border,
    backgroundColor: CORES.card,
  },
  input: {
    flex: 1,
    minHeight: 44, maxHeight: 100,
    borderRadius: 22, borderWidth: 1,
    borderColor: CORES.border,
    backgroundColor: CORES.parch,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: CORES.ink,
  },
  enviarBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: CORES.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  enviarBtnDisabled: { backgroundColor: CORES.border },
  enviarIcon: { fontSize: 16, color: CORES.ink, fontWeight: '700' },
});
