const fs = require('node:fs');
const path = require('node:path');
const Discord = require('discord.js');
const dotenv = require("dotenv");
const UserModel = require('./models/UserModel/userModel');
const FaucetModel = require('./models/FaucetModel/faucetModel');
const mongoose = require('mongoose');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, ComputeBudgetProgram } = require('@solana/web3.js');
const base58 = require('bs58');
const { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddress, getMint, getAccount, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const { Client, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, Events, GatewayIntentBits, Collection, REST, Routes, ActionRowBuilder, OverwriteType, EmbedBuilder, ActivityType } = require('discord.js');

dotenv.config();

const clientID = process.env.APP_ID || "";
const guildId = process.env.GUILD_ID || "";
const token = process.env.DISCORD_TOKEN || "";

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

client.commands = new Collection();
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Initialize Solana connection and wallet
const SOLANA_NETWORK = "https://api.mainnet-beta.solana.com"; // Mainnet endpoint
const connection = new Connection(SOLANA_NETWORK);
const secretKeyString = process.env.SOLANA_SECRET;
if (!secretKeyString) {
    throw new Error('SOLANA_SECRET environment variable is not set');
}

const keypair = Keypair.fromSecretKey(base58.decode(secretKeyString));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
    console.log('Bot is ready!');

    await setCustomStatus();

    // Fetch the channel where you want to send the button
    const channel = client.channels.cache.get(process.env.FAUCET_CHANNEL); // Ensure this is your channel ID

    if (channel) {
        try {
            await manageStickyButtonMessage(channel);
        } catch (error) {
            console.error('Failed to ensure sticky button message:', error);
        }
    }
});

// Function to set custom status
async function setCustomStatus() {

    const amount = await getRemainedToken();

    client.user.setActivity(`${amount} hits of $TOKE left`, { type: 4 })
}


// Function to get remained token amount
async function getRemainedToken() {

    // Configure connection to the Solana mainnet cluster
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

    // The public key of the token's mint address
    const tokenMintAddress = new PublicKey(process.env.TOKEN_ADDRESS);

    const decimals = (await getMint(connection, tokenMintAddress)).decimals;

    try {
        // Get the associated token account address
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,  // Connection to cluster
            keypair.publicKey,  // Payer
            tokenMintAddress,  // Token mint
            keypair.publicKey   // Owner of the token account you're checking
        );

        // Fetch account balance
        const tokenAccountInfo = await getAccount(connection, tokenAccount.address);
        const tokenBalance = tokenAccountInfo.amount;
        const multiplier = BigInt(Math.pow(10, decimals)); // Convert to BigInt for division
        const amount = Number(tokenBalance) / Number(multiplier);
        // const amount = tokenBalance / Math.pow(10, decimals);

        console.log(`TOKE Token balance: ${amount}`);

        return amount;
    } catch (error) {
        console.error(`Error fetching TOKE token balance: ${error}`);
        return 0;
    }


}


// Function to handle the "sticky" button message
async function manageStickyButtonMessage(channel) {
    const messages = await channel.messages.fetch({ limit: 10 }); // Fetch recent messages

    // Check for existing button messages
    const buttonMessage = messages.find(
        msg => msg.author.id === client.user.id && msg.components.length > 0
    );

    if (buttonMessage) {
        await buttonMessage.delete(); // Delete old button message
    }

    await setCustomStatus();

    // Create the new button
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('faucetButton')
                .setLabel('Take a hit!')
                .setStyle(ButtonStyle.Primary)
        );

    await channel.send({ content: 'Click below to hit the TOKE Machine for some free $TOKE!', components: [row] });
    console.log('Button message refreshed.');
}

for (const file of commandFiles) {

    const command = require(`./commands/${file}`);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
        // console.log(command.data.name, command);
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }

    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '9' }).setToken(token || "");
(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(clientID, guildId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

// client.login(token);

client.on(Events.InteractionCreate, async interaction => {
    const userId = interaction.user.id;
    const user = await UserModel.findOne({ discordId: userId });
    try {
        if (interaction.isButton()) {

            if (interaction.customId === 'faucetButton') {
                let currentTime = new Date();

                if (user) {
                    if (user.lastHit) {
                        if (currentTime.getTime() - user.lastHit.getTime() < 1000 * 60 * 60 * 24) {
                            await interaction.reply({ content: "You can get token once in a day.", ephemeral: true });
                            // Refresh the button message to keep it at the bottom
                            const channel = client.channels.cache.get(process.env.FAUCET_CHANNEL);
                            if (channel) {
                                await manageStickyButtonMessage(channel);
                            }
                            return;
                        }
                    }
                }

                // Show the modal for wallet address input
                const modal = new ModalBuilder()
                    .setCustomId('walletModal')
                    .setTitle('Input Wallet Address')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('walletInput')
                                .setLabel('Enter your wallet address')
                                .setStyle(TextInputStyle.Short)
                        )
                    );

                await interaction.showModal(modal);

            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'walletModal') {
                const walletAddress = interaction.fields.getTextInputValue('walletInput');

                // Validate the wallet address
                if (!isValidSolanaAddress(walletAddress)) {
                    await interaction.reply({ content: "Invalid Solana address.", ephemeral: true });
                    // Refresh the button message to keep it at the bottom
                    const channel = client.channels.cache.get(process.env.FAUCET_CHANNEL);
                    if (channel) {
                        await manageStickyButtonMessage(channel);
                    }
                    return;
                }

                // Find user in database or create a new record
                const userId = interaction.user.id;
                let user = await UserModel.findOne({ discordId: userId });
                if (!user) {
                    user = new UserModel({ discordId: userId });
                    await user.save();
                }

                await interaction.deferReply({ ephemeral: true });

                // Attempt to distribute tokens
                const transferResult = await distributeToken(walletAddress, process.env.TOKEN_ADDRESS, 1);
                if (transferResult) {
                    // Update user record with last hit time
                    await UserModel.updateOne({ discordId: userId }, { $set: { lastHit: new Date() } });

                    // Send success reply
                    const alertEmbed = new EmbedBuilder()
                        .setColor(0x6058f3)
                        .setTitle("Token transfer successful!");
                    await interaction.editReply({ embeds: [alertEmbed] });

                    // Log transfer in a particular channel
                    const faucetListsChannel = client.channels.cache.get(process.env.LIST_CHANNEL);
                    if (faucetListsChannel) {

                        const previousData = await FaucetModel.findOne({ label: 'NumberOfHit' });
                        if (!previousData) {
                            const data = new FaucetModel({
                                numberOfHit: 1
                            })
                            await data.save();
                        } else {
                            await FaucetModel.updateOne({ label: 'NumberOfHit' }, { $set: { numberOfHit: previousData.numberOfHit + 1, lastHitDate: new Date() } });
                        }
                        await faucetListsChannel.send(`[#${previousData.numberOfHit}] <@${userId}> just hit the TOKE Machine for 1 $TOKE`);
                        // [#10] @Ed123 just hit the TOKE Machine for 1 $TOKE
                        // await faucetListsChannel.send(`[${previousData.numberOfHit}] @ hits of $TOKE left`);
                        // await faucetListsChannel.send(`[#${previousData.numberOfHit}] <@${userId}> just hit the TOKE Machine for 1 $TOKE`);
                    }
                    // Refresh the button message to keep it at the bottom
                    const channel = client.channels.cache.get(process.env.FAUCET_CHANNEL);
                    if (channel) {
                        await manageStickyButtonMessage(channel);
                    }
                } else {
                    // Send failure reply
                    const alertEmbed = new EmbedBuilder()
                        .setColor(0x6058f3)
                        .setTitle("Token transfer failed!");
                    await interaction.editReply({ embeds: [alertEmbed] });
                    // Refresh the button message to keep it at the bottom
                    const channel = client.channels.cache.get(process.env.FAUCET_CHANNEL);
                    if (channel) {
                        await manageStickyButtonMessage(channel);
                    }
                }
            }

        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
        }
        // Refresh the button message to keep it at the bottom
        const channel = client.channels.cache.get(process.env.FAUCET_CHANNEL);
        if (channel) {
            await manageStickyButtonMessage(channel);
        }
    }
});

async function startBot() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "");
        console.log("Connected to MongoDB.");
        client.login(token);
    } catch (error) {
        console.error("Error connecting to MongoDB or logging in the bot:", error);
    }
}

const distributeToken = async (recipientAddress, tokenAddress, amount) => {
    try {
        const recipientPublicKey = new PublicKey(recipientAddress);
        const token = new PublicKey(tokenAddress)
        const recieverPk = new PublicKey(recipientAddress)

        const decimal = (await getMint(connection, token)).decimals

        const baseSrcAta = await getAssociatedTokenAddress(token, keypair.publicKey)
        const baseDestAta = await getAssociatedTokenAddress(token, recieverPk)

        const transaction = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 120_000 }),
            createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, baseDestAta, recieverPk, token),
            createTransferCheckedInstruction(baseSrcAta, token, baseDestAta, keypair.publicKey, amount * 10 ** decimal, decimal)
        )

        transaction.feePayer = keypair.publicKey
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

        const signature = await connection.sendTransaction(transaction, [keypair], { skipPreflight: true });
        await connection.confirmTransaction(signature, 'confirmed');
        console.log(`Transaction successful with signature: ${signature}`);
        return true;
    } catch (error) {
        console.error('Token distribution failed:', error);
        return false;
    }
};

function isValidSolanaAddress(address) {
    try {
        // Attempt to create a PublicKey instance
        new PublicKey(address);
        return true; // If no error is thrown, the address is valid
    } catch (error) {
        // If an error is thrown, the address is invalid
        return false;
    }
}

startBot();