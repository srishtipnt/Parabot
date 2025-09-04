import * as chrono from 'chrono-node';
import { ObjectId } from 'mongodb';
import { remindersCollection } from '../database.js';

const activeTimers = new Map();
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
export async function handleReminderCommand(sock, chatId, sender, commandArgs) {
    try {
        const results = chrono.parse(commandArgs, new Date(), { forwardDate: true });
        if (results.length === 0) throw new Error("I couldn't understand the time for the reminder.");

        const result = results[results.length - 1];
        const targetDate = result.start.date();
        const reminderText = commandArgs.substring(0, result.index).trim();

        if (!reminderText) throw new Error("You didn't provide a task for the reminder.");

        const now = new Date();
        if (targetDate.getTime() <= now.getTime()) throw new Error("The reminder time must be in the future.");

        const delayMs = targetDate.getTime() - now.getTime();
        if (delayMs > 2147483647) throw new Error("Sorry, I can only set reminders up to ~24 days in the future.");
        
        const reminderDoc = await remindersCollection.insertOne({
            userId: sender,
            chatId: chatId,
            text: reminderText,
            remindAt: targetDate,
            isSent: false
        });
        const reminderId = reminderDoc.insertedId.toString();

        // This is the NEW code to delete after sending
const timerId = setTimeout(() => {
    sock.sendMessage(sender, { text: `🔔 Reminder: ${reminderText}` });
    // Delete the reminder from the database
    remindersCollection.deleteOne({ _id: reminderDoc.insertedId });
    activeTimers.delete(reminderId);
}, delayMs);

        activeTimers.set(reminderId, timerId);

        const formattedDate = targetDate.toLocaleString('en-IN', dateFormatOptions);
        await sock.sendMessage(chatId, { text: `✅ Reminder set! I will remind you to "${reminderText}" on ${formattedDate}.` });

    } catch (error) {
        const usageMessage = `Error: ${error.message}\n\n*Usage:*\n.remind <task> in <time>`;
        await sock.sendMessage(chatId, { text: usageMessage });
    }
}

export async function handleListRemindersCommand(sock, chatId, sender, userLastReminderList) {
    const userReminders = await remindersCollection.find({ userId: sender, isSent: false }).sort({ remindAt: 1 }).toArray();

    if (userReminders.length === 0) {
        await sock.sendMessage(chatId, { text: "You have no active reminders." });
        return;
    }
    
    // Save the list to the user's short-term memory
    userLastReminderList.set(sender, userReminders);

    let responseText = "📋 *Your Active Reminders:*\n\n";
    userReminders.forEach((r, index) => {
        responseText += `*${index + 1}.* ${r.text}\n  - (Time: ${r.remindAt.toLocaleString('en-IN', dateFormatOptions)})\n`;
    });
    responseText += `\nTo cancel, use \`.cr <number>\``;

    await sock.sendMessage(chatId, { text: responseText });
}

export async function handleCancelReminderCommand(sock, chatId, sender, commandArgs, userLastReminderList) {
    let lastReminders = userLastReminderList.get(sender);

    // NEW: If we have no list in memory, fetch it directly from the database.
    if (!lastReminders) {
        console.log(`No reminder list in memory for ${sender}, fetching from DB...`);
        lastReminders = await remindersCollection.find({ userId: sender, isSent: false }).sort({ remindAt: 1 }).toArray();
    }

    if (!lastReminders || lastReminders.length === 0) {
        await sock.sendMessage(chatId, { text: "You have no active reminders to cancel." });
        return;
    }

    const reminderNumber = parseInt(commandArgs, 10);
    if (isNaN(reminderNumber) || reminderNumber <= 0 || reminderNumber > lastReminders.length) {
        await sock.sendMessage(chatId, { text: `Please provide a valid number from 1 to ${lastReminders.length}.` });
        return;
    }

    const reminderToDelete = lastReminders[reminderNumber - 1];
    const reminderId = reminderToDelete._id.toString();

    const timerId = activeTimers.get(reminderId);
    if (timerId) {
        clearTimeout(timerId);
        activeTimers.delete(reminderId);
    }

    await remindersCollection.deleteOne({ _id: reminderToDelete._id, userId: sender });
    userLastReminderList.delete(sender); // Clear the memory for this user just in case
    await sock.sendMessage(chatId, { text: `✅ Reminder #${reminderNumber} ("${reminderToDelete.text}") has been canceled.` });
}