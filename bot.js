import 'dotenv/config';
import {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
} from '@whiskeysockets/baileys';
import P from 'pino';
import qrcode from 'qrcode-terminal';
import { connectDB, settingsCollection } from './database.js';
// At the top of bot.js
import { handleReactCommand } from './features/react.js';
// --- Import ALL Feature Handlers ---
import { handleTagAllCommand } from './features/tagall.js';
import { handlePollCommand } from './features/poll.js';
import { handlePinCommand, handlePinAsNameCommand, handleListPinsCommand, handleUnpinCommand, handleViewPinCommand } from './features/pinboard.js';
import { handleReminderCommand, handleListRemindersCommand, handleCancelReminderCommand } from './features/reminder.js';
import { handleTeamReminderCommand, handleListTeamRemindersCommand, handleCancelTeamReminderCommand } from './features/teamreminder.js';
import { handleSpamCommand, stopSpamCommand } from './features/spam.js';

import { handleHelpCommand } from './features/help.js';

// --- Define the command prefix ---
const COMMAND_PREFIX = '.';

// --- Bot's Short-Term Memory Maps ---
const userLastPinList = new Map();
const userLastReminderList = new Map();
const groupLastReminderList = new Map();

// This Set will hold the IDs of chats where public mode is ON
let publicChats = new Set();
// At the top of bot.js

// --- Load configuration from .env file ---
const BOT_OWNER_NUMBER = process.env.BOT_OWNER_NUMBER;
const BOT_NAME = process.env.BOT_NAME || "Bot";

if (!BOT_OWNER_NUMBER) {
    console.error("❌ FATAL ERROR: BOT_OWNER_NUMBER is not defined in your .env file.");
    process.exit(1);
}

console.log("✅ Bot script started.");
console.log(`👑 Bot Owner is: ${BOT_OWNER_NUMBER}`);
console.log(`🤖 Bot Name is: ${BOT_NAME}`);

async function loadSettings() {
    const settings = await settingsCollection.findOne({ _id: 'public_mode_config' });
    if (settings && settings.enabledChats) {
        publicChats = new Set(settings.enabledChats);
    } else {
        publicChats = new Set();
    }
    console.log(`🔒 Public mode is enabled for ${publicChats.size} chat(s). (Loaded from DB)`);
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({ version, auth: state, printQRInTerminal: true, logger: P({ level: "silent" }) });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { qrcode.generate(qr, { small: true }); console.log("📱 Scan the QR code to log in."); }
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) { startBot(); }
        } else if (connection === "open") { console.log("✅ Connected to WhatsApp"); }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const chatId = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (messageContent.trim().startsWith(COMMAND_PREFIX)) {
            const commandText = messageContent.trim().substring(COMMAND_PREFIX.length).trim();
            const [command, ...argsArr] = commandText.split(' ');
            const args = argsArr.join(' ');

            const isOwner = sender.startsWith(BOT_OWNER_NUMBER);
            const isGroup = chatId.endsWith("@g.us");

             let isGroupAdmin = false;
             if (isGroup) {
            try {
                // This fetches the group's metadata, including participant roles.
                // Note: This makes an API call, which can add a small delay.
                const metadata = await sock.groupMetadata(chatId);
                const participant = metadata.participants.find(p => p.id === sender);
                if (participant) {
                    isGroupAdmin = participant.admin === 'admin' || participant.admin === 'superadmin';
                }
            } catch (error) {
                console.error("Error fetching group metadata:", error);
            }
        }

            // --- Stricter Security Gate ---
            // The owner can always use commands.
            // Anyone else can only use commands in a group where public mode is ON, or in a private chat.
            if (!isOwner && !isGroupAdmin && isGroup && !publicChats.has(chatId)) {
                return; // Bot remains silent for non-owners in non-public groups
            }
            
            try {
                switch (command.toLowerCase()) {
                    // Inside your switch statement in bot.js

                
                    // Inside your switch statement in bot.js

                case 'pmod': // The alias
                case 'pmode': // The original command
                    if (isOwner || isGroupAdmin) {
                        if (!isGroup) {
                            await sock.sendMessage(chatId, { text: "This command can only be used in a group chat." });
                            break;
                        }

                        const currentStateIsOn = publicChats.has(chatId); // Check the current state once

                        if (args.toLowerCase() === 'on') {
                            if (currentStateIsOn) {
                                // It's already on, send an informational message
                                await sock.sendMessage(chatId, { text: "Public mode is already ON for this group." });
                            } else {
                                // It's off, so turn it on
                                publicChats.add(chatId);
                                await settingsCollection.updateOne({ _id: 'public_mode_config' }, { $addToSet: { enabledChats: chatId } }, { upsert: true });
                                await sock.sendMessage(chatId, { text: "✅ Public mode is now ON for *this group*." });
                            }
                        } else if (args.toLowerCase() === 'off') {
                            if (!currentStateIsOn) {
                                // It's already off, send an informational message
                                await sock.sendMessage(chatId, { text: "Public mode is already OFF for this group." });
                            } else {
                                // It's on, so turn it off
                                publicChats.delete(chatId);
                                await settingsCollection.updateOne({ _id: 'public_mode_config' }, { $pull: { enabledChats: chatId } });
                                await sock.sendMessage(chatId, { text: "✅ Public mode is now OFF for *this group*." });
                            }
                        } else {
                            // This is the status check
                            const status = currentStateIsOn ? 'ON' : 'OFF';
                            await sock.sendMessage(chatId, { text: `Public mode is currently ${status} for this group.` });
                        }
                    } else {
                        const status = publicChats.has(chatId) ? 'ON' : 'OFF';
                        await sock.sendMessage(chatId, { text: `Public mode is currently ${status} for this group. Only the owner or a group admin can change it.` });
                    }
                    break;
                    case 'help':
                        await handleHelpCommand(sock, chatId

                        );
                        break;

                    case 'r':
                        await handleReminderCommand(sock, chatId, sender, args);
                        break;
                    
                    case 'lr':
                        await handleListRemindersCommand(sock, chatId, sender, userLastReminderList);
                        break;

                        // Inside the switch statement in bot.js

                case 'react':
                    // We pass the full 'msg' object and the 'args' (the emoji)
                    await handleReactCommand(sock, msg, args);
                    break;
                    
                    case 'cr':
                        await handleCancelReminderCommand(sock, chatId, sender, args, userLastReminderList);
                        break;
                    
                   case 'tr':
                    if (isGroup) await handleTeamReminderCommand(sock, chatId, sender, args);
                    else await sock.sendMessage(chatId, { text: "This command only works in groups." });
                    break;
                
                case 'ltr':
                    // MODIFIED: We now pass the 'sender' so the function knows WHO is asking
                    if (isGroup) await handleListTeamRemindersCommand(sock, chatId, sender, groupLastReminderList);
                    else await sock.sendMessage(chatId, { text: "This command only works in groups." });
                    break;
                
                case 'ctr':
                    // The original call was correct, but we're providing it again to ensure no typos
                    if (isGroup) await handleCancelTeamReminderCommand(sock, chatId, sender, args, groupLastReminderList);
                    else await sock.sendMessage(chatId, { text: "This command only works in groups." });
                    break;
                    case 'pin':
                        if (args.toLowerCase().startsWith('as ')) {
                            const nameToSave = args.substring(3).trim();
                            await handlePinAsNameCommand(sock, msg, nameToSave);
                        } else {
                            await handlePinCommand(sock, msg);
                        }
                        break;

                    case 'pinall':
                        await handleListPinsCommand(sock, chatId, sender, userLastPinList, isGroup);
                        break;
                    
                    case 'unpin':
                        await handleUnpinCommand(sock, chatId, sender, args, userLastPinList);
                        break;

                   // Inside the switch statement in bot.js

                case 'vp':
                    await handleViewPinCommand(sock, chatId, sender, args, userLastPinList);
                    break;

                    // Inside the switch statement in bot.js

                case 'poll':
                    if (isGroup) {
                        // Ensure you are passing the full 'msg' object here, not 'chatId'
                        await handlePollCommand(sock, msg, args);
                    } else {
                        await sock.sendMessage(chatId, { text: "This command only works in groups." });
                    }
                    break;

                    case 'tagall':
                        if (isGroup) await handleTagAllCommand(sock, chatId);
                        else await sock.sendMessage(chatId, { text: "This command only works in groups." });
                        break;
                    
                    case 'spam':
                        await handleSpamCommand(sock, sender, chatId, args);
                       
                        break;

                  // Inside your switch statement in bot.js

                case 'stopspam':
                    const reply = stopSpamCommand(chatId, sender, isOwner, isGroupAdmin);
                    if (reply) { // Only send a message if there is something to say
                        await sock.sendMessage(chatId, { text: reply });
                    }
                    break;

                    default:
                        await sock.sendMessage(chatId, { text: "Sorry, I don't understand that command. Type `.help` to see all available commands." });
                }
            } catch (error) {
                console.error("❌ An error occurred while handling a command:", error);
                await sock.sendMessage(chatId, { text: "Oops! Something went wrong while processing your request." });
            }
            return;
        }
    });
}

// --- Final Startup Sequence ---
connectDB()
    .then(loadSettings)
    .then(() => {
        startBot();
    })
    .catch(error => {
        console.error("Bot failed to start:", error);
        process.exit(1);
    });