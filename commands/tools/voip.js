import { sendText } from '../../core/send.js';
import { voipUrl } from '../../core/qr-server.js';

// ✅ المكالمات الصوتية = سيرفر مستقل (voip-server على 8090).
//    الرابط كيتحسب حسب البيئة: عام فـ المنصة، localhost فـ التطوير.

export default {
  name: 'voip',
  aliases: ['مكالمات', 'كود_المكالمات', 'كود_المكالمة'],
  description: 'لوحة مكالمات واتساب الصوتية الحية — .voip',
  usage: '.voip',
  async execute(sock, m) {
    return sendText(
      sock,
      m.jid,
      `📞 *محرك المكالمات الصوتية الحية*

⚡ شغّل السيرفر المستقل:
\`\`\`
node --env-file=.env start.js
\`\`\`

🌐 اللوحة: ${voipUrl('/')}
📄 الشرح: voip-server/README.md`
    );
  },
};