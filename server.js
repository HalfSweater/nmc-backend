// Load environment variables from .env file
require('dotenv').config();

// Import necessary libraries
const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// --- Discord Bot Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Required to find members to DM
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Log in the bot
client.login(process.env.BOT_TOKEN);
client.once('ready', () => {
    console.log(`Bot is online as ${client.user.tag}!`);
});


// --- Express Server Setup ---
const app = express();
app.use(cors()); // Enable cross-origin requests
app.use(express.json()); // Allow server to accept JSON data

// --- API Endpoint for Registration ---
app.post('/register', async (req, res) => {
    try {
        const { fullName, age, email, ign, discordId } = req.body;
        
        // Find the channel to send the message to
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);
        if (!channel) {
            return res.status(500).json({ message: "Discord channel not found." });
        }

        // Create the rich embed message
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

        // Create the buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`accept-${discordId}`) // Embed user's ID in the button ID
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`deny-${discordId}`) // Embed user's ID in the button ID
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger)
            );

        // Send the message with the embed and buttons
        await channel.send({ embeds: [embed], components: [row] });

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

    // Acknowledge the button click
    await interaction.deferUpdate();

    // Find the member in the server by their Discord Tag (username#1234)
    const guild = interaction.guild;
    const member = guild.members.cache.find(m => m.user.tag === discordId);

    if (!member) {
        await interaction.followUp({ content: `Could not find user with ID "${discordId}". They might have left the server or changed their tag.`, ephemeral: true });
        return;
    }

    try {
        if (action === 'accept') {
            await member.send("Congratulations! You have been **accepted** into the Minecraft Esports Tournament. We will provide you with further information shortly.");
            await interaction.editReply({ content: `✅ Accepted ${discordId}. A DM has been sent.`, components: [] });
        } else if (action === 'deny') {
            await member.send("Unfortunately, you were not selected for this event. Better luck next time!");
            await interaction.editReply({ content: `❌ Denied ${discordId}. A DM has been sent.`, components: [] });
        }
    } catch (dmError) {
        console.error("Could not send DM:", dmError);
        await interaction.followUp({ content: `Could not send a DM to ${discordId}. They may have DMs disabled.`, ephemeral: true });
    }
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
