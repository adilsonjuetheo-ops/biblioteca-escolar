import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { http } from './http';

const PROJECT_ID = '4e9f49b6-7367-4dc1-99a6-0d0431d1874e';

// Exibe notificações mesmo com o app em primeiro plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registrarPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return; // Simuladores não suportam push

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: statusAtual } = await Notifications.getPermissionsAsync();
    let statusFinal = statusAtual;

    if (statusAtual !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      statusFinal = status;
    }

    if (statusFinal !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    await http.post('/usuarios/push-token', {
      token: tokenData.data,
      plataforma: Platform.OS,
    });
  } catch {
    // Nunca bloqueia o fluxo do app
  }
}

export function configurarListenerNotificacao(onTap: () => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(() => onTap());
  return () => sub.remove();
}
