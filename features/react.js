/**
 * Handles the logic for reacting to a message.
 * @param {object} sock The Baileys socket connection.
 * @param {object} msg The full message object.
 * @param {string} commandArgs The arguments for the command (the emoji).
 */
export async function handleReactCommand(sock, msg, commandArgs) {
    const chatId = msg.key.remoteJid;
    const emoji = commandArgs.trim();

    // 1. Validation Checks
    if (!emoji) {
        // We don't send an error message here to keep the chat clean.
        // The command will just silently fail if no emoji is provided.
        return;
    }

    const contextInfo = msg.message.extendedTextMessage?.contextInfo;
    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
        await sock.sendMessage(chatId, { text: "You must reply to a message to react to it." }, { quoted: msg });
        return;
    }

    // 2. Get the key of the message we need to react to
    // This key is found in the contextInfo of your '.react' message
    const targetMessageKey = {
        remoteJid: chatId,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant // This is important for group messages
    };

    // 3. Construct the special 'reaction' message object
    const reactionMessage = {
        react: {
            text: emoji,
            key: targetMessageKey
        }
    };

    try {
        // 4. Send the reaction
        await sock.sendMessage(chatId, reactionMessage);

        // 5. (Optional) Delete the user's '.react' command to keep the chat clean
        // This will only work if the bot is a group admin
        await sock.sendMessage(chatId, { delete: msg.key });

    } catch (error) {
        console.error("Error sending reaction:", error);
        // Silently fail, don't spam the chat with errors for a simple reaction.
    }
}