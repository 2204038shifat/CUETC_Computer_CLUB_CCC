const { GoogleGenerativeAI } = require('@google/generative-ai');
const Event = require('../models/Event');
const Contest = require('../models/Contest');
const News = require('../models/News');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==================== BUILD CONTEXT FROM DATABASE ====================
// Pulls the latest events, contests, and news so the AI answers with
// real, current club data instead of guessing.
const buildClubContext = async () => {
    const [events, contests, news] = await Promise.all([
        Event.find().sort({ createdAt: -1 }).limit(10),
        Contest.find().sort({ createdAt: -1 }).limit(10),
        News.find().sort({ createdAt: -1 }).limit(5)
    ]);

    const eventsText = events.map(e =>
        `- "${e.title}" on ${e.date} at ${e.location}. ${e.description || ''}`
    ).join('\n') || 'No upcoming events right now.';

    const contestsText = contests.map(c =>
        `- "${c.title}" on ${c.date}, prize: ${c.prize}, team size: ${c.teamSize}. ${c.description || ''}`
    ).join('\n') || 'No active contests right now.';

    const newsText = news.map(n =>
        `- "${n.title}": ${(n.content || '').substring(0, 150)}...`
    ).join('\n') || 'No recent news.';

    return `
You are the official AI assistant for CUET Computer Club. Answer using the
information below. Be friendly, concise, and helpful. If something isn't
covered below, say you're not sure and suggest the user check the website or
contact the club, instead of making something up.




CLUB INFORMATION:
- President: Towhidul Islam
- Vice President: Md. Jamil Hossen Safi
- General Secretary: Md.Mahi Islam
- Founded: 12 september 2010
- Contact email: computerclub@cuet.ac.bd
-location:5th Floor,It Incubator,CUET
-abou :A gathering for all tech enthusiasts, a platform for all CUETians to cultivate their technology-prone ideas and to further develop their skill to maximum.
- (এখানে club সম্পর্কে যেকোনো fixed তথ্য যোগ করতে পারেন — meeting time, address, membership fee ইত্যাদি)









HOW THE WEBSITE WORKS:
- To become a member: click "Register" on the website, fill in name, email,
  and password. Every new account is automatically a "member" — there's no
  separate join step.
- To log in: click "Login" and enter your registered email and password.
- To register for an EVENT: open the event page and click "Register". You'll
  fill in your details, then pay the event fee via bKash, Nagad, or Rocket,
  and submit the transaction ID to confirm your spot. A confirmation email is
  sent once it's verified.
- To register for a CONTEST: open the contest page and click "Register Team".
  You'll enter your team name, team members (up to the contest's max size),
  team lead details, then pay the entry fee via bKash, Nagad, or Rocket and
  submit the transaction ID. A confirmation email is sent once verified.
- Forgot password: use the "Forgot Password" link on the login page.
- Admin-only actions (posting events, contests, news) are restricted to club
  admins.

UPCOMING EVENTS:
${eventsText}

ACTIVE CONTESTS:
${contestsText}

RECENT NEWS:
${newsText}
`;
};

// ==================== GET CHATBOT REPLY ====================
const getChatbotReply = async (userMessage, history = []) => {
    const context = await buildClubContext();
    const model = genAI.getGenerativeModel({
        model: 'gemini-3.6-flash',
        systemInstruction: context
    });

    // history: array of { role: 'user' | 'model', text: '...' } from previous turns
    const chat = model.startChat({
        history: history.map(h => ({
            role: h.role === 'assistant' ? 'model' : (h.role === 'bot' ? 'model' : h.role),
            parts: [{ text: h.text }]
        }))
    });

    const result = await chat.sendMessage(userMessage);
    return result.response.text();
};

module.exports = { getChatbotReply };