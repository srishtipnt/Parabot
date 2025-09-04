// In features/poll.js, replace the entire handlePollCommand function

export async function handlePollCommand(sock, msg, commandArgs) {
    // MODIFIED: We now correctly get the chatId from the full msg object
    const chatId = msg.key.remoteJid;

    try {
        const separatorIndex = commandArgs.indexOf('?');

        if (separatorIndex === -1) {
            throw new Error('Invalid format. Please use a question mark (?) to separate the question and options.');
        }

        const question = commandArgs.substring(0, separatorIndex + 1).trim();
        const optionsString = commandArgs.substring(separatorIndex + 1).trim();
        
        const options = optionsString.split(',')
            .map(option => option.trim())
            .filter(opt => opt.length > 0);

        if (!question) {
            throw new Error('The poll question cannot be empty.');
        }
        if (options.length < 2) {
            throw new Error('A poll must have at least two options.');
        }
        if (options.length > 12) {
            throw new Error('A poll cannot have more than 12 options (WhatsApp limit).');
        }

        await sock.sendMessage(chatId, {
            poll: {
                name: question,
                values: options,
                selectableCount: 1
            }
        });

    } catch (error) {
        console.error("Poll command error:", error.message);
        
        const newUsageMessage = `Please make sure your format is correct.\n\n*Usage:*\n.poll <Question>? <Option 1>, <Option 2>`
        
        // This 'quoted: msg' now works because the function receives the full 'msg' object
        await sock.sendMessage(chatId, { text: newUsageMessage }, { quoted: msg });
    }
}