// Load environment variables from your .env file
require('dotenv').config();

// Import necessary libraries
const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// --- In-memory store for rate limiting ---
// We use a Map to store: <discordId, timestampOfLastSubmission>
const submissions = new Map();
const COOLDOWN_PERIOD = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// --- Discord Bot Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Required to find members, send DMs, and manage roles
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.login(process.env.BOT_TOKEN);
client.once('ready', () => {
    console.log(`Bot is online as ${client.user.tag}!`);
});

// --- Express Server Setup ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Helper function to format time left ---
function formatTimeLeft(ms) {
    if (ms <= 0) return "now";
    let totalSeconds = Math.floor(ms / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60);
    return `${hours} hour(s) and ${minutes} minute(s)`;
}

// --- API Endpoint for Registration with Rate Limiting ---
app.post('/register', async (req, res) => {
    try {
        const { fullName, age, email, ign, discordId } = req.body;
        
        // --- Rate Limiting Logic ---
        const now = Date.now();
        if (submissions.has(discordId)) {
            const lastSubmissionTime = submissions.get(discordId);
            const timeSinceLastSubmission = now - lastSubmissionTime;

            if (timeSinceLastSubmission < COOLDOWN_PERIOD) {
                const timeLeft = COOLDOWN_PERIOD - timeSinceLastSubmission;
                // Return a "Too Many Requests" error with a helpful message
                return res.status(429).json({ 
                    message: `You have already applied.`
                });
            }
        }
        // --- End of Rate Limiting Logic ---

        const channel = await client.channels.fetch(process.env.CHANNEL_ID);
        if (!channel) {
            return res.status(500).json({ message: "Discord channel not found." });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('New Tournament Registration!')
            .setColor('#3f51b5')
            .addFields(
                { name: 'Full Name', value: fullName, inline: true },
                { name: 'Age', value: age, inline: true },
                { name: 'Email Address', value: email, inline: false },
                { name: 'In-Game Name (IGN)', value: ign, inline: true },
                { name: 'Discord ID', value: discordId, inline: true }
            )
            .setFooter({ text: `Registration received at: ${new Date().toLocaleString()}` });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`accept-${discordId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`deny-${discordId}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
            );

        await channel.send({ embeds: [embed], components: [row] });

        // Record the successful submission time to enforce the cooldown
        submissions.set(discordId, now);

        res.status(200).json({ message: 'Registration sent successfully!' });

    } catch (error) {
        console.error("Error processing registration:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
});

// --- Listener for Button Interactions ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, discordId] = interaction.customId.split('-');
    if (action !== 'accept' && action !== 'deny') return;

    await interaction.deferUpdate();

    const guild = interaction.guild;
    const member = guild.members.cache.find(m => m.user.tag === discordId);

    if (!member) {
        await interaction.followUp({ content: `❌ Could not find user with Discord ID "${discordId}". They may have left the server or changed their tag.`, ephemeral: true });
        return;
    }

    try {
        if (action === 'accept') {
            const role = guild.roles.cache.get(process.env.ACCEPTED_ROLE_ID);
            if (role) {
                await member.roles.add(role);
            } else {
                console.error(`Role with ID ${process.env.ACCEPTED_ROLE_ID} not found.`);
                await interaction.followUp({ content: `⚠️ Error: The specified role was not found on the server.`, ephemeral: true });
                return;
            }

            const acceptEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('⚔️ Welcome to the Arena, Contender!')
                .setThumbnail(member.user.displayAvatarURL())
                .setDescription(`Congratulations, **${member.user.username}**! Your spot in the **Esport Minecraft Tournament** has been officially secured.`)
                .addFields(
                    { name: 'Access Granted', value: `You have been given the **${role.name}** role, unlocking exclusive tournament channels.` },
                    { name: 'Next Steps', value: 'Please keep an eye on the announcements channel for bracket information and match schedules.' },
                    { name: 'Prepare for Battle!', value: 'The journey begins now. Hone your skills and get ready to compete!' }
                )
                .setFooter({ text: guild.name, iconURL: guild.iconURL() })
                .setTimestamp();
            
            await member.send({ embeds: [acceptEmbed] });
            await interaction.editReply({ content: `✅ **Accepted** ${member.user.tag} and assigned the "${role.name}" role.`, components: [] });

        } else if (action === 'deny') {
            const denyEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('Registration Status Update')
                .setDescription(`Hello **${member.user.username}**, thank you for your interest in the **Esport Minecraft Tournament**.`)
                .addFields(
                    { name: 'Our Decision', value: 'Due to the high volume of applications and limited spots, we are unfortunately unable to offer you a position in this event.' },
                    { name: 'Stay Connected', value: 'We encourage you to stay active in our community for future events and tournaments. We appreciate your passion and skill!' }
                )
                .setFooter({ text: guild.name, iconURL: guild.iconURL() })
                .setTimestamp();

            await member.send({ embeds: [denyEmbed] });
            await interaction.editReply({ content: `❌ **Denied** ${member.user.tag}. A notification DM has been sent.`, components: [] });
        }
    } catch (error) {
        console.error("Error during interaction processing:", error);
        if (error.code === 50007) {
            await interaction.followUp({ content: `⚠️ Could not send a DM to ${member.user.tag}. They may have DMs disabled.`, ephemeral: true });
        } else {
            await interaction.followUp({ content: `⚠️ An error occurred while processing this action. Please check the bot's permissions and role hierarchy.`, ephemeral: true });
        }
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
