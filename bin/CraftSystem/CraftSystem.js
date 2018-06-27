class CraftSystem {

    static getXP(craftLevel, playerCraftlevel, rarity, collect) {

        let xp = Math.ceil(10* (Math.pow(craftLevel, 2)) / 6 * (.5 + rarity / 2));

        let diff = playerCraftlevel - craftLevel;
        diff = diff < 0 ? -diff : diff;

        if(collect) {
            xp = xp / 6;
            xp = Math.ceil(xp * (diff > 4 ? 0.35 : 1));
        } else {
            xp = Math.ceil(xp * (diff > 2 ? 1/diff : 1));
        }

        return xp;
    }
}

module.exports = CraftSystem;