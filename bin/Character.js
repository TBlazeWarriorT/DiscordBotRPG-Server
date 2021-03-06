'use strict';
const conn = require("../conf/mysql.js");
const Globals = require("./Globals.js");
const CharacterInventory = require("./CharacterInventory.js");
const CharacterEntity = require("./Entities/CharacterEntity.js");
const MarketplaceOrder = require("./Marketplace/MarketplaceOrder.js");
const Item = require("./Items/Item.js");
const Consumable = require("./Items/Consumable.js");
const PlayerCraft = require("./CraftSystem/PlayerCraft.js");
const LootSystem = require("./LootSystem.js");
const PStatistics = require("./Achievement/PStatistics.js");
const conf = require("../conf/conf");
const CharacterAchievement = require("./Achievement/CharacterAchievements");

class Character extends CharacterEntity {

    constructor(idUser) {
        super();
        this._type = "Character";
        this.id = null;
        this.idUser = idUser != null ? idUser : null;
        this.inv = new CharacterInventory();
        this.craftSystem = new PlayerCraft();
        this.achievements = new CharacterAchievement();
        this.statPoints = 0;
        this.money = 0;
        this.canFightAt = 0;
        this.idArea = 1;
        this.area;
        this.idGuild = 0;

        // Party mechanics
        this.pendingPartyInvite = null;
        this.group = null;

        // Trade mechanic
        this.pendingTradeInvite = null;
        this.trade = null;
    }

    getIdUser() {
        return this.idUser;
    }

    async init() {

        var res = await conn.query("INSERT INTO characters VALUES (NULL, 5, 100, 1);");
        this.id = res["insertId"];

        //Init level system
        await Promise.all([
            this.levelSystem.init(this.id),
            this.craftSystem.init(this.id),
            this.stats.init(this.id),
            this.getInv().loadInventory(this.id),
            this.equipement.loadEquipements(this.id),
            conn.query("INSERT INTO charactershonor VALUES (" + this.id + ", 0);"),
            this.achievements.load(this.id)
        ]);

        this.statPoints = 5;
        this.money = 100;
        this.idArea = 1;

        this.updateStats();
    }

    async loadCharacter(id) {
        // load from database
        let res = (await conn.query("SELECT statPoints, money, idArea " +
            "FROM characters " +
            "INNER JOIN charactershonor ON charactershonor.idCharacter = characters.idCharacter " +
            "WHERE characters.idCharacter = ?", [id]))[0];
        this.id = id;
        await Promise.all([
            this.stats.loadStat(id),
            this.levelSystem.loadLevelSystem(id),
            this.craftSystem.load(id),
            this.getInv().loadInventory(id),
            this.equipement.loadEquipements(id),
            this.achievements.load(id)
        ]);

        this.statPoints = res["statPoints"];
        this.money = res["money"];
        this.idArea = res["idArea"];

        res = await conn.query("SELECT idGuild FROM guildsmembers WHERE idCharacter = ?;", [id]);
        if (res.length > 0) {
            this.idGuild = res[0]["idGuild"];
        }

        this.updateStats();

    }

    async saveArea() {
        await conn.query("UPDATE characters SET idArea = " + this.getIdArea() + " WHERE idCharacter = " + this.id);
    }

    async changeArea(area, waitTime = Globals.basicWaitTimeAfterTravel) {
        let baseTimeToWait = await this.getWaitTimeTravel(waitTime);
        //console.log("User : " + this.id + " have to wait " + baseTimeToWait / 1000 + " seconds to wait before next fight");
        this.setWaitTime(Date.now() + baseTimeToWait);
        this.area = area;
        await this.saveArea();
        PStatistics.incrStat(this.id, "travels", 1);
    }

    setArea(area) {
        this.area = area;
    }

    resetWaitTime() {
        this.setWaitTime(0);
    }

    /**
     * 
     * @param {Number} percentage 
     */
    reduceWaitTime(percentage = 0) {
        percentage = percentage >= 0 && percentage <= 1 ? percentage : 0;
        let reduce = this.getExhaustMillis() * percentage;
        this.setWaitTime(this.getWaitTime() - reduce);
    }

    setWaitTime(time) {
        this.canFightAt = time;
    }

    getWaitTime() {
        return this.canFightAt;
    }

    getIdArea() {
        return this.area.id;
    }

    /**
     * @returns {Area}
     */
    getArea() {
        return this.area;
    }

    getIDRegion() {
        return this.area.getIDRegion();
    }

    getEquipement() {
        return this.equipement;
    }

    /**
     * @returns {number} Exhuast time in seconds
     */
    getExhaust() {
        return Math.ceil((this.getWaitTime() - Date.now()) / 1000);
    }

    getExhaustMillis() {
        return this.getWaitTime() - Date.now();
    }

    canDoAction() {
        return conf.env == "dev" ? true : (this.getWaitTime() <= Date.now());;
    }

    // Group System
    leaveGroup() {
        this.group = null;
    }

    // Trade system
    cancelTrade() {
        this.trade = null;
    }

    isTrading() {
        return this.trade != null;
    }

    damageCalcul() {
        let baseDamage = (this.stats.strength + 1 + this.equipement.stats.strength) * 2;
        return Math.ceil(Math.random() * (baseDamage * 1.25 - baseDamage * 0.75) + baseDamage * 0.75);
    }

    // Critical hit
    isThisACriticalHit() {
        // LAST NUMBER = NBR MAX ITEM
        // LIMIT 50%
        // Maximum Stat for this level
        let max = this.getLevel() * 2 * 4;
        // Calcul of chance
        let critique = (this.stats.dexterity + this.equipement.stats.dexterity) / max;

        // Cap to 50%;
        critique = critique > .75 ? .75 : critique;

        return Math.random() <= critique ? true : false;

    }

    /**
     * 
     * @param {string} stat 
     * @param {number} nbr 
     * @returns {boolean} True if no errors False if not
     */
    async upStat(stat, nbr) {
        nbr = parseInt(nbr, 10);
        if (nbr > 0 && nbr <= this.statPoints) {
            switch (stat) {
                // Principaux
                case "str":
                    this.stats.strength += nbr;
                    stat = "strength";
                    break;
                case "int":
                    this.stats.intellect += nbr;
                    stat = "intellect";
                    break;
                case "con":
                    this.stats.constitution += nbr;
                    stat = "constitution";
                    break;
                case "dex":
                    this.stats.dexterity += nbr;
                    stat = "dexterity";
                    break;

                // Secondaires

                case "cha":
                    this.stats.charisma += nbr;
                    stat = "charisma";
                    break;
                case "wis":
                    this.stats.wisdom += nbr;
                    stat = "wisdom";
                    break;
                case "will":
                    this.stats.will += nbr;
                    stat = "will";
                    break;
                case "per":
                    this.stats.perception += nbr;
                    stat = "perception";
                    break;
                case "luck":
                    this.stats.luck += nbr;
                    stat = "luck";
                    break;
            }
            await this.stats.saveThisStat(stat);
            // Remove attributes points

            this.statPoints -= nbr;
            await this.saveStatsPoints();
            this.updateStats();
            return true;
        }

        return false;
    }

    // Call for reseting stats
    async resetStats() {
        let resetValue = this.getResetStatsValue()
        if (await this.doIHaveEnoughMoney(resetValue)) {
            await this.removeMoney(resetValue);
            await this.stats.reset();
            this.statPoints = this.levelSystem.actualLevel * 5;
            await this.saveStatsPoints();
            return true;
        }
        return false;
    }

    getResetStatsValue() {
        let levelMult = this.getLevel() > 2 ? this.getLevel() : 0;
        return Math.round(((levelMult) * Globals.resetStatsPricePerLevel));
    }

    async addExp(exp) {
        let startingLevel = this.levelSystem.actualLevel;
        await this.levelSystem.addThisExp(exp);
        if (startingLevel < this.levelSystem.actualLevel) {
            this.statPoints += 5 * (this.levelSystem.actualLevel - startingLevel);
            await this.saveStatsPoints();
            await this.levelSystem.saveMyLevel();
        } else {
            await this.levelSystem.saveMyExp();
        }
    }

    async addMoney(money) {
        money = money >= 0 ? money : 0;
        await conn.query("UPDATE characters SET money = money + ? WHERE idCharacter = ?;", [money, this.id]);
    }

    async removeMoney(money) {
        money = money >= 0 ? money : 0;
        await conn.query("UPDATE characters SET money = money - ? WHERE idCharacter = ?;", [money, this.id]);
    }

    async doIHaveEnoughMoney(money) {
        return (await this.getMoney() >= money);
    }

    /**
     * 
     * @param {number} honorPoints 
     */
    async addHonorPoints(honorPoints) {
        if (honorPoints != null) {
            if (honorPoints >= 0) {
                await conn.query("UPDATE charactershonor SET Honor = Honor + ? WHERE idCharacter = ?;", [honorPoints, this.id]);
            } else {
                await this.removeHonorPoints(-honorPoints);
            }
            return true;
        }
        return false;
    }

    async removeHonorPoints(honorPoints) {
        let honor = await this.getHonor() - honorPoints;
        honor = honor < 0 ? 0 : honor;
        await conn.query("UPDATE charactershonor SET Honor = ? WHERE idCharacter = ?;", [honor, this.id]);
    }

    // number : Nbr of items to sell
    async sellThisItem(idEmplacement, number) {
        number = number ? number : 1;
        let value = await (await (this.getInv()).getItem(idEmplacement)).getCost(number);


        // Si cost > 0 alors item existe et peut se vendre
        // On fait passer true pour deleteo bject puisque si on delete tout item on doit delete de la bdd
        if (value > 0) {
            await Promise.all([
                this.getInv().removeSomeFromInventory(idEmplacement, number, true),
                this.addMoney(value)
            ]);
            PStatistics.incrStat(this.id, "gold_sell", value);
        }
        return value;
    }

    /**
     * 
     * @param {Item} item 
     * @param {*} number 
     */
    async sellThisItemWithItem(item, number) {
        number = number ? number : 1;
        let value = item.getCost(number);
        if (value > 0) {
            await Promise.all([
                this.getInv().removeSomeFromInventoryItem(item, number, true),
                this.addMoney(value)
            ]);
            PStatistics.incrStat(this.id, "gold_sell", value);
        }
        return value;
    }

    async sellAllInventory(params) {
        let value = await this.getInv().getAllInventoryValue(params);
        await Promise.all([
            this.getInv().deleteAllFromInventory(params),
            this.addMoney(value)
        ]);
        PStatistics.incrStat(this.id, "gold_sell", value);
        return value;
    }

    async setItemFavoriteInv(idEmplacement, fav) {
        await (await (this.getInv()).getItem(idEmplacement)).setFavorite(fav ? fav : false);
    }

    async setItemFavoriteEquip(idEquip, fav) {
        await (await (this.equipement).getItem(idEquip)).setFavorite(fav ? fav : false);
    }

    async getItemFromAllInventories(idItem) {
        let item = await this.getInv().getItemOfThisIDItem(idItem);
        if (item == null)
            item = await this.getEquipement().getItemByIDItem(idItem);
        return item;
    }

    // Craft
    isCraftable(craft) {
        return craft.itemInfo.minLevel <= this.getCraftLevel();
    }

    itemCraftedLevel(maxLevelItem) {
        let craftingBuilding = this.getArea().getService("craftingbuilding");
        maxLevelItem = craftingBuilding.getMaxLevel() < maxLevelItem ? craftingBuilding.getMaxLevel() : maxLevelItem;
        return this.getCraftLevel() <= maxLevelItem ? this.getCraftLevel() : maxLevelItem;
    }

    async craft(craft) {
        let gotAllItems = true;
        if (craft.id > 0) {
            gotAllItems = (await conn.query("CALL doesPlayerHaveEnoughMatsToCraftThisItem(?, ?);", [this.id, craft.id]))[0][0].doesPlayerHaveEnoughMats;
            if (gotAllItems == "true") {
                let promises = [];
                // Since it's idItem i can promise all without worrying if the right item is deleted
                for (let i in craft.requiredItems) {
                    promises.push(this.getInv().removeSomeFromInventoryIdBase(craft.requiredItems[i].idBase, craft.requiredItems[i].number, true));
                }
                await Promise.all(promises);

                let ls = new LootSystem();
                await ls.giveToPlayer(this, craft.itemInfo.idBase, this.itemCraftedLevel(craft.itemInfo.maxLevel), 1);
                return true;
            }
        }
        return false;
    }


    // Marketplace

    async sellToMarketplace(marketplace, idEmplacement, nbr, price, lang = "en") {
        let order;
        let idItem;
        if (await this.getAmountOfThisItem(idEmplacement) > nbr) {
            // Je doit créer un nouvel item
            let item = await this.getInv().getItem(idEmplacement);
            idItem = await Item.lightInsert(item.idBaseItem, item.level);
        } else {
            // Là je n'en ai pas besoin puisque c'est le même nombre
            idItem = await this.getInv().getIdItemOfThisEmplacement(idEmplacement);
        }
        await this.getInv().removeSomeFromInventory(idEmplacement, nbr, false);
        order = new MarketplaceOrder(marketplace.id, idItem, this.id, nbr, price);
        await order.place();

        return await order.toApi(lang);
    }


    async marketplaceCollectThisItem(order) {
        let item = new Item(order.idItem);
        await item.loadItem();
        await order.remove();
        if (item.isStackable() == false) {
            await this.getInv().addToInventory(order.idItem, order.number);
        } else {
            let inventoryItemID = await this.getIdOfThisIdBase(item.idBaseItem, item.getLevel());
            if (inventoryItemID != null) {
                await this.getInv().addToInventory(inventoryItemID, order.number);
                await item.deleteItem();
            } else {
                await this.getInv().addToInventory(order.idItem, order.number);
            }
        }

    }


    async marketplaceBuyThisItem(order, number) {
        if (order.number == number) {
            await this.marketplaceCollectThisItem(order);
        } else {
            order.number -= number;
            await order.update();
            let item = new Item(order.idItem);
            await item.loadItem();
            if (item.isStackable() == false) {
                await this.getInv().addToInventory(order.idItem, order.number);
            } else {
                let inventoryItemID = await this.getIdOfThisIdBase(item.idBaseItem, item.getLevel());
                if (inventoryItemID != null) {
                    await this.getInv().addToInventory(inventoryItemID, number);
                } else {
                    let idItem = await Item.lightInsert(item.idBaseItem, item.level);
                    await this.getInv().addToInventory(idItem, number);
                }
            }

        }
        await this.removeMoney(order.price * number);
    }

    /**
     * 
     * @param {Consumable} itemToUse 
     */
    async use(itemToUse, idEmplacement, amount) {
        if (this.canUse(itemToUse)) {
            amount = amount > 0 ? amount : 1;
            amount = amount > itemToUse.number ? itemToUse.number : (amount < 1 ? 1 : amount);
            if (itemToUse.canBeMultUsed == false) {
                amount = 1;
            }
            amount = amount > 100 ? 100 : amount;
            await this.getInv().removeSomeFromInventory(idEmplacement, amount, true);
            await itemToUse.prepareToUse();
            let promises = [];
            for (let i = 0; i < amount; i++) {
                promises.push(itemToUse.use(this));
            }
            await Promise.all(promises);
        }
    }

    /**
     * 
     * @param {Item} item 
     */
    canUse(item) {
        if (item != null) {
            return item.isUsable();
        }
        return false;
    }

    // More = time in ms
    waitForNextFight(more = 0) {
        let waitTime = this.getWaitTimeFight(more);
        //console.log("User : " + this.id + " have to wait " + (baseTimeToWait + more) / 1000 + " seconds to wait before next fight");
        this.setWaitTime(Date.now() + waitTime);
        return waitTime;
    }

    waitForNextPvPFight(more = 0) {
        let waitTime = this.getWaitTimePvPFight(more);
        //console.log("User : " + this.id + " have to wait " + (baseTimeToWait + more) / 1000 + " seconds to wait before next fight");
        this.setWaitTime(Date.now() + waitTime);
        return waitTime;
    }

    waitForNextResource(rarity = 1) {
        let baseTimeToWait = this.getWaitTimeResource(rarity);
        //console.log("User : " + this.id + " have to wait " + baseTimeToWait / 1000 + " seconds to wait before next fight");
        this.setWaitTime(Date.now() + baseTimeToWait);
        return baseTimeToWait;
    }

    waitForNextCraft(rarity = 1) {
        let baseTimeToWait = this.getWaitTimeCraft(rarity);
        //console.log("User : " + this.id + " have to wait " + baseTimeToWait / 1000 + " seconds to wait before next fight");
        this.setWaitTime(Date.now() + baseTimeToWait);
        return baseTimeToWait;
    }

    getWaitTimeCraft(rarity = 1) {
        return (Globals.basicWaitTimeCraft - Math.floor(this.getCraftLevel() / Globals.maxLevel * Globals.basicWaitTimeCraft / 2)) * 1000 * rarity;
    }

    getWaitTimeResource(rarity = 1) {
        let waitTime = Globals.collectTriesOnce * Globals.basicWaitTimeCollectTravel;
        return (waitTime - Math.floor(this.getCraftLevel() / Globals.maxLevel * waitTime / 2)) * 1000 * (rarity / 2);
    }

    getWaitTimeFight(more = 0) {
        let conReduction = Math.floor(this.getStat("constitution") / 50);
        conReduction = conReduction > Globals.basicWaitTimeBeforeFight / 2 ? Globals.basicWaitTimeBeforeFight / 2 : conReduction;
        return (Globals.basicWaitTimeBeforeFight - conReduction) * 1000 + more;
    }

    getWaitTimePvPFight(more = 0) {
        let conReduction = Math.floor(this.getStat("charisma") / 50);
        conReduction = conReduction > Globals.basicWaitTimeBeforePvPFight / 2 ? Globals.basicWaitTimeBeforePvPFight / 2 : conReduction;
        return (Globals.basicWaitTimeBeforePvPFight - conReduction) * 1000 + more;
    }

    async getWaitTimeTravel(waitTime = Globals.basicWaitTimeAfterTravel) {
        let mount = await this.getEquipement().getItemByTypeName("mount");
        let multiplier = mount != null ? mount.getTravelReductionModifier() : 1;
        let baseTimeToWait = Math.floor((waitTime * multiplier)) * 1000;
        return baseTimeToWait;
    }

    async isInGuild() {
        return await this.getIDGuild() > 0;
    }

    async addCraftXP(xp) {
        let actualLevel = this.getCraftLevel();
        let nextLevel = 0;
        await this.craftSystem.addThisExp(xp);
        nextLevel = this.getCraftLevel();
        return nextLevel - actualLevel;
    }

    // GetSpecial
    async getStatPoints() {
        return this.statPoints;
        //return conn.query("SELECT statPoints FROM characters WHERE idCharacter = ?", [this.id]);
    }

    async getHonor() {
        return (await conn.query("SELECT honor FROM charactershonor WHERE idCharacter = ?;", [this.id]))[0].honor;
    }

    async getMoney() {
        return (await conn.query("SELECT money FROM characters WHERE idCharacter = ?;", [this.id]))[0].money;
    }

    /**
     * @returns {CharacterInventory}
     */
    getInv() {
        return this.inv;
    }

    getLevel() {
        return this.levelSystem.actualLevel;
    }

    getCraftLevel() {
        return this.craftSystem.getLevel();
    }

    getCratfXP() {
        return this.craftSystem.actualXP;
    }

    getCraftNextLevelXP() {
        return this.craftSystem.expToNextLevel;
    }

    getAchievements() {
        return this.achievements;
    }

    async haveThisObject(itemId) {
        return await this.getInv().doIHaveThisItem(itemId);
    }

    async haveThisObjectEquipped(idEmplacement) {
        return await this.equipement.getItem(idEmplacement);
    }

    async getAmountOfThisItem(idEmplacement) {
        let item = await this.getInv().getItem(idEmplacement);
        return item != null ? item.number : 0;
    }

    async getIdOfThisIdBase(idBaseItem, level = 1) {
        return await this.getInv().getIdOfThisIdBase(idBaseItem, level);
    }

    async isItemFavorite(idEmplacement) {
        let item = await this.getInv().getItem(idEmplacement);
        return item != null ? item.isFavorite : false;
    }

    async getIDGuild() {
        let res = await conn.query("SELECT idGuild FROM guildsmembers WHERE idCharacter = ?;", [this.id]);
        return res[0] != null ? res[0].idGuild : 0;
    }

    // Partie Base De Donn�e
    async saveStatsPoints() {
        await conn.query("UPDATE characters SET statPoints = ? WHERE idCharacter = ?;", [await this.getStatPoints(), this.id]);
    }

    async saveMoney() {
        await conn.query("UPDATE characters SET money = ? WHERE idCharacter = ?;", [await this.getMoney(), this.id]);
    }

    async saveHonor() {
        await conn.query("UPDATE charactershonor SET honor = ? WHERE idCharacter = ?"[await this.getHonor(), this.id]);
    }

    async toApiSimple() {
        return {
            name: this.getName(),
            level: this.getLevel(),
            power: await this.getPower(),
        }
    }

    static async exist(id) {
        if (id > 0) {
            let res = await conn.query("SELECT characters.idCharacter FROM characters WHERE characters.idCharacter = ?;", [id]);
            if (res != null && res[0] != null) {
                return true;
            } else {
                return false;
            }
        }
        return false;
    }

    static async staticGetIdByUID(uid) {
        if (uid != null) {
            let res = await conn.query("SELECT idCharacter FROM users WHERE idUser = ?;", [uid]);
            if (res[0]) {
                return res[0].idCharacter;
            }
        }
        return null;
    }


}

module.exports = Character;

const Area = require("./Areas/Area");