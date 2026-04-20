import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Comunicado } from '../appTypes';

const CORES = {
  ink: '#1a1208',
  parch: '#f5efe3',
  warm: '#e8dcc8',
  amber: '#c97b2e',
  sage: '#4a7c59',
  muted: '#8a7d68',
  card: '#fdfaf4',
  border: '#d9cfbe',
};

type Props = {
  comunicados: Comunicado[];
  carregando?: boolean;
  titulo: string;
  subtitulo: string;
  headerLeft?: React.ReactNode;
  showAudienceBadge?: boolean;
};

function getAudienceIcon(destinatario?: string) {
  if (destinatario === 'alunos') return '🎒';
  if (destinatario === 'professores') return '📖';
  return '📢';
}

function getAudienceLabel(destinatario?: string) {
  if (destinatario === 'alunos') return 'Alunos';
  if (destinatario === 'professores') return 'Professores';
  return 'Todos';
}

function getAudienceColors(destinatario?: string) {
  if (destinatario === 'alunos') {
    return { backgroundColor: 'rgba(201,123,46,0.12)', color: CORES.amber };
  }
  if (destinatario === 'professores') {
    return { backgroundColor: 'rgba(74,100,144,0.12)', color: '#4a6490' };
  }
  return { backgroundColor: 'rgba(74,124,89,0.12)', color: CORES.sage };
}

export default function ComunicadosList({
  comunicados,
  carregando = false,
  titulo,
  subtitulo,
  headerLeft,
  showAudienceBadge = false,
}: Props) {
  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={s.homeHeader}>
        {headerLeft}
        <View style={{ flex: 1 }}>
          <Text style={s.homeGreeting}>{titulo}</Text>
          <Text style={s.homeName}>{subtitulo}</Text>
        </View>
      </View>
      <View style={{ padding: 16 }}>
        {carregando ? (
          <ActivityIndicator color={CORES.amber} size="large" style={{ marginTop: 40 }} />
        ) : comunicados.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>📢</Text>
            <Text style={s.emptyText}>Nenhum comunicado no momento</Text>
          </View>
        ) : (
          comunicados.map((com) => {
            const audienceColors = getAudienceColors(com.destinatario);
            return (
              <View key={com.id} style={s.comunicadoCard}>
                <View style={s.comunicadoHeader}>
                  <View style={s.comunicadoIconWrap}>
                    <Text style={s.iconText}>{getAudienceIcon(com.destinatario)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.comunicadoTitulo}>{com.titulo}</Text>
                    <Text style={s.comunicadoMeta}>
                      {com.criadoEm ? new Date(com.criadoEm).toLocaleDateString('pt-BR') : '—'}
                    </Text>
                  </View>
                  {showAudienceBadge ? (
                    <View style={[s.badgeSmall, { backgroundColor: audienceColors.backgroundColor }]}>
                      <Text style={[s.badgeText, { color: audienceColors.color }]}>
                        {getAudienceLabel(com.destinatario)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={s.comunicadoMensagem}>{com.mensagem}</Text>
                <Text style={s.comunicadoAutor}>Enviado por: {com.autor || com.autorNome || 'Biblioteca'}</Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  homeHeader: {
    backgroundColor: CORES.ink,
    padding: 20,
    paddingTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homeGreeting: { fontSize: 13, color: 'rgba(245,239,227,0.6)', fontWeight: '500' },
  homeName: { fontSize: 22, fontWeight: '700', color: CORES.parch, marginTop: 2 },
  emptyBox: {
    backgroundColor: CORES.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CORES.border,
  },
  emptyIcon: { fontSize: 40, textAlign: 'center', marginBottom: 12 },
  emptyText: { color: CORES.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  comunicadoCard: {
    backgroundColor: CORES.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: CORES.border,
    marginBottom: 12,
  },
  comunicadoHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  comunicadoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CORES.warm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: { fontSize: 20 },
  comunicadoTitulo: { fontSize: 14, fontWeight: '700', color: CORES.ink },
  comunicadoMeta: { fontSize: 11, color: CORES.muted, marginTop: 2 },
  comunicadoMensagem: { fontSize: 14, color: CORES.ink, lineHeight: 22, marginBottom: 10 },
  comunicadoAutor: { fontSize: 11, color: CORES.muted, fontStyle: 'italic' },
  badgeSmall: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
