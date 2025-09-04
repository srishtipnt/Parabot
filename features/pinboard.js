import { ObjectId } from 'mongodb';
import { contactsCollection, pinsCollection } from '../database.js';

/**
 * Main command to pin a message. Now saves the origin chat ID.
 */
export async function handlePinCommand(sock, msg) {
    const chatId = msg.key.remoteJid;
    const pinnerJid = msg.key.participant || msg.key.remoteJid;
    const contextInfo = msg.message.extendedTextMessage?.contextInfo;
    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
        await sock.sendMessage(chatId, { text: 'You must reply to a message to pin it.' });
        return;
    }

    if (contextInfo?.isForwarded) {
        await sock.sendMessage(chatId, { text: "This is a forwarded message. Please reply again with the format:\n\n`.pin as <Original Sender's Name>`" });
        return;
    } 
    
    const originalSenderJid = contextInfo?.participant;
    if (!originalSenderJid) {
        await sock.sendMessage(chatId, { text: "Sorry, I couldn't identify the original sender." });
        return;
    }

    // --- NEW DEBUG LOGS FOR READING ---
   
    const contact = await contactsCollection.findOne({ ownerJid: pinnerJid, contactJid: originalSenderJid });

   
    if (contact) {
        await savePin(pinnerJid, quotedMsg, originalSenderJid, chatId);
        await sock.sendMessage(chatId, { text: `✅ Message pinned!` });
    } else {
        const senderNumber = originalSenderJid.split('@')[0];
        await sock.sendMessage(chatId, { text: `I haven't learned the name for @${senderNumber} in your contacts. To save this pin and their name, please reply again with the format:\n\n\`.pin as <Their Name>\``, mentions: [originalSenderJid] });
    }
}


/**
 * Handles the `.pin as <Name>` command. Also saves the origin chat ID.
 */
export async function handlePinAsNameCommand(sock, msg, nameToSave) {
    const chatId = msg.key.remoteJid;
    const pinnerJid = msg.key.participant || msg.key.remoteJid;
    const contextInfo = msg.message.extendedTextMessage?.contextInfo;
    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
        await sock.sendMessage(chatId, { text: 'You must use this command in reply to a message.' });
        return;
    }
    const originalSenderJid = contextInfo?.participant;

    try {
        if (originalSenderJid) {
            // --- DEBUG LOGS START HERE ---
           
            
            const result = await contactsCollection.updateOne(
                { ownerJid: pinnerJid, contactJid: originalSenderJid },
                { $set: { ownerJid: pinnerJid, contactJid: originalSenderJid, name: nameToSave } },
                { upsert: true }
            );

           

            if (result.acknowledged) {
                await savePin(pinnerJid, quotedMsg, originalSenderJid, chatId);
                await sock.sendMessage(chatId, { text: `✅ Got it! I've saved the pin and will remember this user as *${nameToSave}* for you.` });
            } else {
                 console.error("MongoDB write was NOT acknowledged.");
                 await sock.sendMessage(chatId, { text: "Sorry, a database error occurred. The contact was not saved." });
            }
        } else {
            await savePin(pinnerJid, quotedMsg, nameToSave, chatId);
            await sock.sendMessage(chatId, { text: `✅ Got it! I've saved the pin from *${nameToSave}*.` });
        }
    } catch (error) {
        console.error("❌ CRITICAL ERROR in handlePinAsNameCommand:", error);
        await sock.sendMessage(chatId, { text: "Sorry, a critical error occurred while saving the pin." });
    }
}


/**
 * Lists pinned messages. Is now context-aware based on where the command is used.
 */
export async function handleListPinsCommand(sock, chatId, sender, userLastPinList, isGroup) {
    let query = { pinnerJid: sender }; 
    if (isGroup) {
        // If in a group, only show pins that originated from this group
        query.originChatId = chatId;
    }

    const userPins = await pinsCollection.find(query).sort({ pinnedAt: -1 }).toArray();

    // The destination for the detailed list is ALWAYS the person who sent the command.
    const destinationJid = sender;

    if (userPins.length === 0) {
        const message = isGroup 
            ? "You have no messages pinned from this group."
            : "You have no pinned messages.";
        // Send the "no pins" message privately.
        await sock.sendMessage(destinationJid, { text: message });
    } else {
        // Save the list to the user's short-term memory for the .unpin command
        userLastPinList.set(sender, userPins);

        let responseTitle;
        if (isGroup) {
            // Get the group name for a nicer title in the private message
            const groupMetadata = await sock.groupMetadata(chatId);
            responseTitle = `📌 *Pins from the group "${groupMetadata.subject}":*\n\n`;
        } else {
            responseTitle = "📌 *Your Pinned Messages (All):*\n\n";
        }
        
        let responseText = responseTitle;
        for (const [index, pin] of userPins.entries()) {
            const snippet = pin.text.length > 60 ? pin.text.substring(0, 60) + '...' : pin.text;
            
            let senderName = "Unknown Sender";
            if (pin.senderJid) {
                if (pin.senderJid.includes('@s.whatsapp.net')) {
                    const contact = await contactsCollection.findOne({ ownerJid: sender, contactJid: pin.senderJid });
                    senderName = contact ? contact.name : `@${pin.senderJid.split('@')[0]}`;
                } else {
                    senderName = pin.senderJid;
                }
            }
            
            responseText += `${index + 1}. (from *${senderName}*) "${snippet}"\n`;
        }
        
        responseText += `\nTo view, use \`.vp <number>\`\nTo remove, use \`.unpin <number>\``;

        // Send the detailed list to the user's private chat
        await sock.sendMessage(destinationJid, { text: responseText });
    }

    // If the original command was used in a group, send a short confirmation message there.
    if (isGroup) {
        await sock.sendMessage(chatId, { text: "✅ I've sent your list of pinned messages to you privately." });
    }
}
/**
 * Removes a pin using its number from the last shown list.
 */
export async function handleUnpinCommand(sock, chatId, sender, commandArgs, userLastPinList) {
    const lastPins = userLastPinList.get(sender);

    if (!lastPins) {
        await sock.sendMessage(chatId, { text: "I don't have a recent list for you. Please run `.pins` command first, then try again." });
        return;
    }

    const pinNumber = parseInt(commandArgs, 10);
    if (isNaN(pinNumber) || pinNumber <= 0 || pinNumber > lastPins.length) {
        await sock.sendMessage(chatId, { text: `Please provide a valid number from 1 to ${lastPins.length}.` });
        return;
    }

    const pinToDelete = lastPins[pinNumber - 1];

    await pinsCollection.deleteOne({ _id: pinToDelete._id, pinnerJid: sender });
    userLastPinList.delete(sender);
    await sock.sendMessage(chatId, { text: `✅ Pin #${pinNumber} ("${pinToDelete.text.substring(0, 20)}...") has been removed.` });
}



// Helper function to save a pin to the database, now includes the origin chat
async function savePin(pinnerJid, quotedMsg, senderIdentifier, originChatId) {
    const messageToPin = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || "Unsupported message type";
    
    await pinsCollection.insertOne({
        pinnerJid: pinnerJid,
        text: messageToPin,
        senderJid: senderIdentifier,
        originChatId: originChatId,
        pinnedAt: new Date()
    });
}


export async function handleViewPinCommand(sock, chatId, sender, commandArgs, userLastPinList) {
    const lastPins = userLastPinList.get(sender);

    if (!lastPins) {
        await sock.sendMessage(chatId, { text: "I don't have a recent list for you. Please run the `.pins` command first, then try again." });
        return;
    }

    const pinNumber = parseInt(commandArgs, 10);
    if (isNaN(pinNumber) || pinNumber <= 0 || pinNumber > lastPins.length) {
        await sock.sendMessage(chatId, { text: `Please provide a valid number from 1 to ${lastPins.length}.` });
        return;
    }

    const pinToShow = lastPins[pinNumber - 1];
    
    let senderName = "Unknown Sender";
    if (pinToShow.senderJid) {
        if (pinToShow.senderJid.includes('@s.whatsapp.net')) {
            const contact = await contactsCollection.findOne({ ownerJid: sender, contactJid: pinToShow.senderJid });
            senderName = contact ? contact.name : `@${pinToShow.senderJid.split('@')[0]}`;
        } else {
            senderName = pinToShow.senderJid;
        }
    }
    
    const fullPinMessage = `📌 *Pin #${pinNumber}* (from *${senderName}*):\n\n${pinToShow.text}`;
    await sock.sendMessage(chatId, { text: fullPinMessage });
}

