import * as chrono from 'chrono-node';
import { ObjectId } from 'mongodb';
import { teamRemindersCollection, contactsCollection } from '../database.js';

// This Map still holds the active setTimeout timers for the current session
const activeGroupTimers = new Map();
const dateFormatOptions = {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true // This ensures AM/PM format and helps remove seconds
};
/**
 * Sets a group reminder for the person who sent the command.
 */
export async function handleTeamReminderCommand(sock, chatId, sender, commandArgs) {
    try {
        const results = chrono.parse(commandArgs, new Date(), { forwardDate: true });
        if (results.length === 0) throw new Error("I couldn't understand the time for the reminder.");

        const result = results[results.length - 1];
        const targetDate = result.start.date();
        const reminderText = commandArgs.substring(0, result.index).trim();
        if (!reminderText) throw new Error("You didn't provide a task for the group reminder.");

        const now = new Date();
        if (targetDate.getTime() <= now.getTime()) throw new Error("The reminder time must be in the future.");

        const delayMs = targetDate.getTime() - now.getTime();
        if (delayMs > 2147483647) throw new Error("Sorry, I can only set reminders up to ~24 days in the future.");
        
        const reminderDoc = await teamRemindersCollection.insertOne({
            chatId: chatId,
            setterId: sender,
            text: reminderText,
            remindAt: targetDate,
            isSent: false
        });
        const reminderId = reminderDoc.insertedId.toString();

        const timerId = setTimeout(async () => {
            try {
                // NEW: Get the bot's own ID to exclude it from the mentions
                const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

                const metadata = await sock.groupMetadata(chatId);
                // MODIFIED: Get all participants AND filter out the bot's own ID
                const participantsToTag = metadata.participants.map(p => p.id).filter(id => id !== botJid);
                
                let mentionText = '\n\n';
                // Use the new filtered list to build the mention text
                participantsToTag.forEach(p => { mentionText += `@${p.split('@')[0]} `});

                const contact = await contactsCollection.findOne({ jid: sender });
                const senderName = contact ? contact.name : `@${sender.split('@')[0]}`;
                const reminderMessage = `🔔 *Group Reminder* (set by ${senderName}):\n\n${reminderText}${mentionText.trim()}`;
                
                // Use the new filtered list for the mentions property
                await sock.sendMessage(chatId, { text: reminderMessage, mentions: participantsToTag });
                await teamRemindersCollection.deleteOne({ _id: reminderDoc.insertedId });
            } catch (error) {
                console.error("Error sending group reminder:", error);
                await sock.sendMessage(sender, { text: `I couldn't send the group reminder for "${reminderText}".` });
            } finally {
                activeGroupTimers.delete(reminderId);
            }
        }, delayMs);
        
        activeGroupTimers.set(reminderId, timerId);

        const formattedDate = targetDate.toLocaleString('en-IN', dateFormatOptions);
        await sock.sendMessage(chatId, {
            text: `✅ Tag-All reminder set!\nI will remind everyone here for "${reminderText}" on ${formattedDate}.`
        });
    } catch (error) {
        const usageMessage = `Error: ${error.message}\n\n*Usage:*\n.teamremind <task> at <time>`;
        await sock.sendMessage(chatId, { text: usageMessage });
    }
}

/**
 * Lists reminders set ONLY BY THE SENDER in the current group.
 */
export async function handleListTeamRemindersCommand(sock, chatId, sender, groupLastReminderList) {
    // The query now filters for the specific user (setterId: sender) in this chat
    const userGroupReminders = await teamRemindersCollection.find({ chatId: chatId, setterId: sender, isSent: false }).sort({ remindAt: 1 }).toArray();

    if (userGroupReminders.length === 0) {
        await sock.sendMessage(chatId, { text: "You have no active reminders in this group." });
        return;
    }

    // Key the memory by a combination of chat and sender to keep it unique
    groupLastReminderList.set(chatId + sender, userGroupReminders);

    let responseText = "📋 *Your Active Reminders in This Group:*\n\n";
    userGroupReminders.forEach((r, index) => {
        responseText += `*${index + 1}.* ${r.text}\n  - (Time: ${r.remindAt.toLocaleString('en-IN', dateFormatOptions)})\n`;
    });
    responseText += `\nTo cancel, use \`.ctr <number>\``;
    await sock.sendMessage(chatId, { text: responseText });
}

/**
 * Cancels a reminder, but ONLY IF THE SENDER created it.
 */
export async function handleCancelTeamReminderCommand(sock, chatId, sender, commandArgs, groupLastReminderList) {
    let lastReminders = groupLastReminderList.get(chatId + sender);

    // NEW: If we have no list in memory, fetch it directly from the database.
    if (!lastReminders) {
        console.log(`No team reminder list in memory for ${chatId}, fetching from DB...`);
        lastReminders = await teamRemindersCollection.find({ chatId: chatId, setterId: sender, isSent: false }).sort({ remindAt: 1 }).toArray();
    }

    if (!lastReminders || lastReminders.length === 0) {
        await sock.sendMessage(chatId, { text: "You have no active reminders in this group to cancel." });
        return;
    }

    const reminderNumber = parseInt(commandArgs, 10);
    if (isNaN(reminderNumber) || reminderNumber <= 0 || reminderNumber > lastReminders.length) {
        await sock.sendMessage(chatId, { text: `Please provide a valid number from 1 to ${lastReminders.length}.` });
        return;
    }

    const reminderToDelete = lastReminders[reminderNumber - 1];

    if (reminderToDelete.setterId !== sender) {
        await sock.sendMessage(chatId, { text: "You can only cancel reminders that you have set yourself." });
        return;
    }
    
    const reminderId = reminderToDelete._id.toString();
    const timerId = activeGroupTimers.get(reminderId);
    if (timerId) {
        clearTimeout(timerId);
        activeGroupTimers.delete(reminderId);
    }

    await teamRemindersCollection.deleteOne({ _id: reminderToDelete._id });
    groupLastReminderList.delete(chatId + sender);
    await sock.sendMessage(chatId, { text: `✅ Your group reminder #${reminderNumber} ("${reminderToDelete.text}") has been canceled.` });
}