/**
 * Sends a single, compact, and easy-to-read help message.
 */
export async function handleHelpCommand(sock, chatId) {

    const helpMessage = `
Hello! Here are all my commands.

*━━━「 General 」━━━*
• \`.help\` - Shows this message
• \`.pmode on/off\` - Toggles public mode (owner/admin)

*━━━「 Pin Board 」━━━*
• \`.pin\` - Saves a message (in reply)
• \`.pinall\` - Shows your saved pins
• \`.vp <number>\` - Views a full pin
• \`.unpin <number>\` - Removes a pin

*━━━「 Reminders 」━━━*
• \`.r <task> in <time>\`
• \`.lr\` - Lists your personal reminders
• \`.cr <number>\` - Cancels a personal reminder

*━━「 Group Reminders 」━━*
• \`.tr <task> at <time>\`
• \`.ltr\` - Lists your group reminders
• \`.ctr <number>\` - Cancels a group reminder

*━━━「 Group Tools 」━━━*
• \`.poll <Q>? <Opt1>, <Opt2>\`
• \`.tagall\` - Mentions all group members
• \`.spam <msg> <count>\` - Repeats a message multiple times
• \`.stopspam\` - Stops spam in the chat

*━━━「 Reactions 」━━━*
• \`.react <emoji>\` - Reacts to a message (in reply)
`;

    await sock.sendMessage(chatId, { text: helpMessage });
}