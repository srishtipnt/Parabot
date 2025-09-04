// features/tagall.js

/**
 * Handles the logic for the tagall command.
 * @param {object} sock The Baileys socket connection.
 * @param {string} chatId The JID of the group chat.
 */
export async function handleTagAllCommand(sock, chatId) {
  try {
    // Get group metadata
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const metadata = await sock.groupMetadata(chatId);
    
    // Get the list of participant JIDs
    const participants = metadata.participants.map(p => p.id).filter(id => id !== botJid);

    // Create the message text with mentions
    let text = "📣 Calling everyone!\n\n";
    for (let jid of participants) {
      // The '@' sign followed by the number creates the mention
      text += `@${jid.split('@')[0]}\n`;
    }

    // Send the message with mentions
    await sock.sendMessage(chatId, { text, mentions: participants });

  } catch (error) {
    console.error("Error in tagall command:", error);
    await sock.sendMessage(chatId, { text: " Sorry, I couldn't tag everyone. Am I an admin in this group?" });
  }
}