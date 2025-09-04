const delay = ms => new Promise(res => setTimeout(res, ms));
let activeSpamJobs = {};

/**
 * Handles the logic for the spam command.
 */
export async function handleSpamCommand(sock, starterJid, chatId, commandArgs) {
  // --- MODIFIED: Argument parsing logic is now reversed ---
  const args = commandArgs.trim().split(' ');
  const countStr = args.pop(); // Use pop() to get the LAST element
  const messageToSpam = args.join(' '); // The rest of the array is the message
  const count = parseInt(countStr, 10);

  // Validation
  if (isNaN(count) || !messageToSpam) {
    await sock.sendMessage(chatId, { text: 'Invalid format.\nPlease use: `.spam <message> <count>`' });
    return;
  }
  
  const limit = 50;
  if (count > limit || count <= 0) {
    await sock.sendMessage(chatId, { text: `Please provide a number between 1 and ${limit}.` });
    return;
  }

  if (activeSpamJobs[chatId]?.isRunning) {
    await sock.sendMessage(chatId, { text: 'A spam job is already in progress in this chat.' });
    return;
  }

  activeSpamJobs[chatId] = {
    isRunning: true,
    startedBy: starterJid 
  };
  
  await sock.sendMessage(chatId, { text: `Starting spam job... To stop, use ".stopspam".` });

  try {
    for (let i = 0; i < count; i++) {
      const currentJob = activeSpamJobs[chatId];
      if (!currentJob || !currentJob.isRunning) {
        await sock.sendMessage(chatId, { text: "Spam job stopped." });
        break;
      }
      
      await sock.sendMessage(chatId, { text: messageToSpam });

      const randomDelay = Math.floor(Math.random() * 1000) + 1000;
      await delay(randomDelay);
    }
  } catch (error) {
    console.error("❌ Error during spam command:", error);
  } finally {
    delete activeSpamJobs[chatId];
  }
}

/**
 * Stops an active spam job, with detailed permissions and silent operation.
 */
export function stopSpamCommand(chatId, stopperJid, isOwner, isGroupAdmin) {
  const job = activeSpamJobs[chatId];

  if (!job) {
    return "There is no active spam job in this chat to stop.";
  }

  const canStop = isOwner || isGroupAdmin || job.startedBy === stopperJid;

  if (!canStop) {
    // Silently ignore unauthorized users
    return null; 
  }
  
  job.isRunning = false;
  
  // Silently stop for authorized users
  return null;
}