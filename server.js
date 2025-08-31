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
        GatewayIntentBits.GuildMembers, // Required to find members and manage roles
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
app.use(cors());
app.use(express.json());

// --- API Endpoint for Registration (No Changes Here) ---
app.post('/register', async (req, res) => {
    try {
        const { fullName, age, email, ign, discordId } = req.body;
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
        res.status(200).json({ message: 'Registration sent successfully!' });
    } catch (error) {
        console.error("Error processing registration:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
});

// --- Listener for Button Interactions (FULLY UPDATED) ---
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
            // --- NEW: Assign the role ---
            const role = guild.roles.cache.get(process.env.ACCEPTED_ROLE_ID);
            if (role) {
                await member.roles.add(role);
            } else {
                console.error(`Role with ID ${process.env.ACCEPTED_ROLE_ID} not found.`);
                await interaction.followUp({ content: `⚠️ Error: The specified role was not found on the server.`, ephemeral: true });
                return;
            }

            // --- NEW: "Sexy" Acceptance DM using an Embed ---
            const acceptEmbed = new EmbedBuilder()
                .setColor('#57F287') // Vibrant Green
                .setTitle('⚔️ Welcome to the Arena, Contender!')
                .setThumbnail(member.user.displayAvatarURL())
                .setDescription(`Congratulations, **${member.user.username}**! Your spot in the **Minecraft Esport Tournament** has been officially secured.`)
                .addFields(
                    { name: 'Access Granted', value: `You have been given the **${role.name}** role, unlocking exclusive tournament channels.` },
                    { name: 'Next Steps', value: 'Please keep an eye on the announcements channel for bracket information and match schedules.' },
                    { name: 'Prepare for Battle!', value: 'The journey begins now. Hone your skills and get ready to compete! See you on 19th September' }
                )
                .setFooter({ text: guild.name, iconURL: guild.iconURL() })
                .setTimestamp();
            
            await member.send({ embeds: [acceptEmbed] });
            await interaction.editReply({ content: `✅ **Accepted** ${member.user.tag} and assigned the "${role.name}" role.`, components: [] });

        } else if (action === 'deny') {
            // --- NEW: Professional Denial DM using an Embed ---
            const denyEmbed = new EmbedBuilder()
                .setColor('#ED4245') // Red
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
        if (error.code === 50007) { // Discord error code for "Cannot send messages to this user"
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
