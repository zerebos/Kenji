const {Command} = require("discord.js-commando");

const getLevel = xp => Math.round(Math.sqrt(4 * xp + 5) / Math.sqrt(20));

const defaultConfig = {
    ignoredRoles: [],
    ignoredChannels: [],
    levelUpMessage: "Congratulations {{user}} you've reached level {{level}}!",
    shouldDM: false,
    rewards: []
};

module.exports = class extends Command {
    constructor(client) {
        super(client, {
            name: "transfer",
            group: "levels",
            memberName: "transfer",
            description: "nah",
            guildOnly: true,
            ownerOnly: true,
            userPermissions: ["MANAGE_ROLES"]
        });
    }
    
    async run(msg) {
        const oldData = require("../../../levels.json");
        const guildData = oldData[msg.guild.id];
        if (!guildData) return await msg.failure("This guild has no data to transfer");
        const ids = Object.keys(guildData);
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const userData = guildData[id];
            const extractLvls = (val, max = 10) => userData.level > val ? Math.min(userData.level - val, max) : 0;
            const getXP = (levels, perLevel) => levels * perLevel;

            const oldXP = [
                getXP(extractLvls(150, Infinity), 200),
                getXP(extractLvls(100, 50), 150),
                getXP(extractLvls(70, 30), 125),
                getXP(extractLvls(50, 20), 100),
                getXP(extractLvls(30, 20), 75),
                getXP(extractLvls(15, 15), 60),
                getXP(extractLvls(1, 15), 30)
            ];

            const totalFromLvls = oldXP.reduce((a, b) => a + b, 0);
            const amount = totalFromLvls + userData.xp;
            await this.setXp(msg.guild, id, amount);

            const member = msg.guild.members.cache.get(id);
            console.log(`Successfully set xp of ${member ? member.user.username : id} to ${amount}`);
            await new Promise(r => setTimeout(r, 250));
        }
        await msg.success(`Successfully set xp of ${ids.length} members.`);
        console.log("COMPLETED");
    }

    async setXp(guild, id, amount) {
        const levels = guild.settings.get("levels", {});
        if (!levels[id]) levels[id] = {level: 0, xp: 0}; // If user didn't exist
        const userData = levels[id];
        userData.xp = amount; // set the xp amount
        const originalLevel = userData.level;
        const newLevel = getLevel(userData.xp);
        userData.level = newLevel;
        levels[id] = userData;
        await guild.settings.set("levels", levels);
        if (newLevel === originalLevel) return; // Same level, nothing to do

        // User levelled up, time to do stuff
        const config = guild.settings.get("levelsConfig", defaultConfig);

        // Message handled, time to check for role rewards
        const rewards = config.rewards;
        if (!rewards || !rewards.length) return; // Already handled message, if no rewards then nothing to do
        const availableRewards = config.rewards.filter(r => r.level <= newLevel).sort((a, b) => {
            if (a.level < b.level) return -1;
            if (a.level > b.level) return 1;
            return 0;
        }).reverse();
        const needToCheck = availableRewards.slice(1); // These lower roles need to be scrutinized

        // [top role for level, any below that should not be removed]
        const shouldHave = [availableRewards[0], ...needToCheck.filter(r => !r.shouldRemove)]; 

        // [Roles above level (just in case adjusting downwards), any below that *should* be removed]
        const shouldNotHave = [...rewards.filter(r => r.level > newLevel), ...needToCheck.filter(r => r.shouldRemove)];
        
        const member = guild.members.cache.get(id);
        if (!member) return; // uh oh
        if (shouldHave.length) await member.roles.add(shouldHave.map(r => r.role), "XP Rewards");
        if (shouldNotHave.length) await member.roles.remove(shouldNotHave.map(r => r.role), "XP Rewards");
    }
};