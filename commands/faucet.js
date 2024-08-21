const { SlashCommandBuilder } = require('discord.js');
const { MessageActionRow, TextInputStyle, TextInputComponent, ModalBuilder, TextInputBuilder, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('faucet')
        .setDescription('Submit your wallet address to receive TOKE token'),

    async execute(interaction) {

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
    },
};