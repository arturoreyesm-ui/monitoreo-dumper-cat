// CONFIGURACIÓN OPCIONAL PARA ALERTAS
// Telegram:
// 1) Crea un bot con @BotFather
// 2) Copia tu token
// 3) Obtén tu chat_id escribiendo al bot y usando getUpdates
//
// Correo:
// El navegador no puede enviar emails directos sin un servicio externo.
// La opción "formsubmit" usa https://formsubmit.co y puede pedir confirmar
// el correo la primera vez. Para producción, usa EmailJS o un backend propio.
window.ALERT_CONFIG = {
  telegramEnabled: false,
  telegramBotToken: "PEGA_AQUI_TU_TOKEN",
  telegramChatId: "PEGA_AQUI_TU_CHAT_ID",

  emailEnabled: true,
  emailProvider: "formsubmit",
  emailTo: "arturo.reyes.m@uni.pe",
  emailSubject: "Alerta Dumper - Comparacion real vs teorica",

  acceptanceThreshold: 80,
  speedTolerancePct: 20,
  confidenceMinPct: 55,
  alertCooldownMs: 300000,
  logEveryMs: 5000,
  logMinSpeedKmh: 0.2
};
