'use strict';
const conn = require("../conf/mysql.js");
const Discord = require("discord.js");
const Globals = require("./Globals.js");

class Guild {
    // Discord User Info
    constructor() {
        this.id = 0;
        this.members = {};
        this.message = "";
        this.name = "";
        this.money = 0;
        this.nbrMembers = 0;
        this.level = 1;
    }

    // Create guild
    // Return err = array of errors
    createGuild(guildName, idCharacter) {
        // Need to verify if guild name already taken
        let res = [];
        let err = [];

        // Verifcation nom guilde
        if (guildName.length > 60 || guildName.length < 4) {
            err.push("Le nom de la guilde doit ne doit pas dépasser 60 caratères ou être inférieur à 4 caractères.");
            return err;
        }

        // Verification si nom déjà pris
        res = conn.query("SELECT idGuild FROM Guilds WHERE nom = '?';", [guildName]);
        if (res.length > 0) {
            err.push("Ce nom de guilde est déjà pris.");
            return err;
        }

        // Create guild
        res = conn.query("INSERT INTO Guilds VALUES(NULL, '?', '', 1, 0);", [guildName])["insertId"];

        // Insert guild master
        conn.query("INSERT INTO GuildsMembers VALUES(" + idCharacter + ", " + res + " , 3)")

        // Add To MemberList
        res = conn.query("SELECT users.userName, users.idUser FROM users " +
            "WHERE idCharacter = " + idCharacter + ";")[0];
        this.members[idCharacter] = {
            name: res["userName"],
            rank: rank,
            idUser: res["idUser"],
        }
        this.nbrMembers++;

        this.id = res;
        this.name = guildName;
        // err.length = 0 => pas d'erreurs;
        return err;
    }

    /**
     * @param {Number} idAsk IDSelf
     * @param {Number} idOther ID Of Character to Add
     * @param {Number} rank (optional) rank
     */
    addMember(idAsk, idOther, rank) {
        rank = rank ? rank : 1;
        let err = [];
        let res;
        if (this.members[idAsk].rank > 1) {
            if (!this.isMaxMembersLimitReached()) {
                res = conn.query("SELECT users.userName, users.idUser FROM users " +
                    "WHERE idCharacter = " + idOther + ";")[0];
                this.members[idOther] = {
                    name: res["userName"],
                    rank: 1,
                    idUser: res["idUser"],
                }
                conn.query("INSERT INTO guildsmembers VALUES(" + idOther + ", " + this.id + ", " + rank + " );");
                this.nbrMembers++;
            } else {
                err.push("Vous avez atteint le nombre maximal de membres.");
            }

        } else {
            err.push("Vous n'avez pas la permission d'ajouter des membres.");
        }
        return err;
    }

    removeMember(idAsk, idOther) {
        let err = [];
        if (this.members[idOther]) {
            if (this.members[idAsk].rank > this.members[idOther].rank || idAsk == idOther) {
                if (this.members[idOther].rank < 3) {
                    delete this.members[idOther];
                    conn.query("DELETE FROM guildsmembers WHERE idCharacter = " + idOther + ";");
                    this.nbrMembers--;
                } else {
                    err.push("Vous êtes le chef de guilde, vous ne pouvez pas abandonner la guilde comme cela, mais vous pouvez la dissoudre avec la commande ::gdisband");
                }

            } else {
                err.push("Vous n'avez pas les droits pour supprimer ce membre.");
            }
        } else {
            err.push("Ce membre n'existe pas.");
        }

        return err;
    }

    updateMember(idAsk, idOther, rank) {
        let err = [];
        if (this.members[idOther]) {
            if (this.members[idAsk].rank > this.members[idOther].rank && rank < this.members[idAsk].rank) {
                conn.query("UPDATE guildsmembers SET idGuildRank = " + rank + " WHERE idCharacter = " + idOther + ";");
                this.members[idOther].rank = rank;
            } else {
                err.push("Vous ne pouvez pas faire cela.");
            }
        } else {
            err.push("Ce membre n'existe pas.");
        }
        
        return err;
    }

    
    disband(connectedUsers) {
        conn.query("DELETE FROM guildsmembers WHERE idGuild = " + this.id);
        conn.query("DELETE FROM guildsappliances WHERE idGuild = " + this.id);
        conn.query("DELETE FROM guilds WHERE idGuild = " + this.id);
        for (let i in this.members) {
            if (connectedUsers[this.members[i].idUser]) {
                connectedUsers[this.members[i].idUser].character.idGuild = 0;
            }
        }
    }

    canCancelApplies(idCharacter) {
        return this.members[idCharacter].rank > 1 ? true : false;
    }



    // Guild Load
    loadGuild(id) {
        // Info guild
        let res = conn.query("SELECT * FROM Guilds WHERE idGuild = " + id + ";")[0];
        this.message = res["message"];
        this.name = res["nom"];
        this.id = id;
        this.level = res["level"];
        this.money = res["argent"];

        // Members
        res = conn.query("SELECT guildsmembers.idGuildRank, guildsmembers.idCharacter, users.userName, users.idUser FROM guildsmembers " +
            "INNER JOIN users ON users.idCharacter = guildsmembers.idCharacter " +
            "WHERE guildsmembers.idGuild = " + id + ";");

        for (let i in res) {
            this.members[res[i]["idCharacter"]] = {
                name: res[i]["userName"],
                rank: res[i]["idGuildRank"],
                idUser: res[i]["idUser"],
            };
            this.nbrMembers++;
        }

    }

    toStr() {
        let membersStr = "```";
        let rmStr = "";
        let roStr = "";
        let rgmStr = "";
        for (let i in this.members) {
            switch (this.members[i].rank) {
                case 1:
                    rmStr += i + " | " + this.members[i].name + " | Membre \n";
                    break;
                case 2:
                    roStr += i + " | " + this.members[i].name + " | Officier\n";
                    break;
                case 3:
                    rgmStr += i + " | " + this.members[i].name + " | Chef de Guilde\n";
                    break;
            }
        }

        membersStr += rgmStr + roStr + rmStr + "```";

        let embed = new Discord.RichEmbed()
            .setColor([0, 255, 0])
            .setAuthor(this.name, "https://upload.wikimedia.org/wikipedia/commons/b/b4/Guild-logo-01_.png")
            .addField("Message de guilde", (this.message ? this.message : "Pas de message de guilde"))
            .addField("Membres " + this.nbrMembers + "/" + (Globals.guilds.baseMembers + (Globals.guilds.membersPerLevels * this.level)), membersStr)
            .addField("Level : " + this.level + "/" + Globals.guilds.maxLevel, "Argent pour monter de niveau : " + this.getNextLevelPrice() + "G", true)
            .addField("Money", this.money + "G", true);

        return embed;
    }

    getIdUserByIdCharacter(idCharacter) {
        return this.members[idCharacter] ? this.members[idCharacter].idUser : null;
    }

    isMaxMembersLimitReached() {
        return Object.keys(this.members).length < (Globals.guilds.baseMembers + (Globals.guilds.membersPerLevels * this.level)) ? false : true;
    }

    setMessage(idCharacter, message) {
        let err = [];

        if (message.length < 255) {
            if (this.members[idCharacter].rank >= 2) {
                this.message = message;
                this.saveMessage();
            } else {
                err.push("Vous n'avez pas la permission de modifier le message de guilde.");
            }
        } else {
            err.push("Vous ne pouvez pas dépasser 254 charactères.");
        }

        return err;
    }

    saveMessage() {
        conn.query("UPDATE guilds SET message = ? WHERE idGuild = " + this.id, [this.message]);
    }

    saveMoney() {
        conn.query("UPDATE guilds SET argent = " + this.money + " WHERE idGuild = " + this.id);
    }

    saveLevel() {
        conn.query("UPDATE guilds SET level = " + this.level + " WHERE idGuild = " + this.id);
    }

    /**
     * 
     * @param {Number} number > 0
     */
    addMoney(number) {
        if (number > 0) {
            this.money += number;
            this.saveMoney();
            return true;
        }
        return false;

    }

    /**
     * Return true if done else false
     * @param {Number} number
     */
    removeMoney(number, idCharacter) {
        let err = [];

        if (this.money >= number && number > 0) {
            if (this.members[idCharacter].rank == 3) {
                this.money -= number;
                this.saveMoney();
            } else {
                err.push("Vous n'avez pas la permission de retirer de l'argent.");
            }
        } else {
            err.push("Vous ne pouvez pas retirer autant d'argent.");
        }

        return err;
    }

    /**
     * Return true if done else false
     */
    levelUp(idCharacter) {
        let err = [];

        if (this.members[idCharacter].rank >= 2) {
            if (this.removeMoney(this.getNextLevelPrice())) {
                this.level += 1;
                this.saveLevel();
            } else {
                err.push("Votre guilde n'a pas assez d'argent pour monter de niveau. Il vous manque : " + this.getNextLevelPrice() + "G");
            }
        
        } else {
            err.psuh("Vous n'avez pas la permission de monter le niveau de la guilde.");
        }


        return err;
    }

    getNextLevelPrice() {
        return Globals.guilds.basePriceLevel * this.level * Globals.guilds.multBasePricePerLevel;
    }

    // Apppliance of ugild
    getGuildAppliances(page) {
        page = page <= 0 ? 1 : page;
        let idCharacterMaxLength = 10;
        let userNameMaxLength = 35;
        let actualLevelMaxLength = 11;

        let idCharacterLength;
        let userNameLength;
        let actualLevelLength;

        let res = conn.query("SELECT guildsappliances.idCharacter, users.userName, levels.actualLevel FROM guildsappliances " +
            "INNER JOIN users ON users.idCharacter = guildsappliances.idCharacter " +
            "INNER JOIN levels ON levels.idCharacter = guildsappliances.idCharacter " +
            "WHERE guildsappliances.idGuild = " + this.id +
            " ORDER BY users.userName ASC LIMIT 10 OFFSET " + ((page - 1) * 10));

        let str = "```";

        if (res.length > 0) {
            str += "|" + "    id    " + "|" + "                nom                " + "|" + "   level   " + "|" + "\n";
            for (let i of res) {
                idCharacterLength = i.idCharacter.toString().length;
                idCharacterLength = (idCharacterMaxLength - idCharacterLength) / 2;

                userNameLength = i.userName.length;
                userNameLength = (userNameMaxLength - userNameLength) / 2;

                actualLevelLength = i.actualLevel.toString().length;
                actualLevelLength = (actualLevelMaxLength - actualLevelLength) / 2;


                str += "|" + " ".repeat(Math.floor(idCharacterLength)) + i.idCharacter + " ".repeat(Math.ceil(idCharacterLength)) + "|"
                    + " ".repeat(Math.floor(userNameLength)) + i.userName + " ".repeat(Math.ceil(userNameLength)) + "|"
                    + " ".repeat(Math.floor(actualLevelLength)) + i.actualLevel + " ".repeat(Math.ceil(actualLevelLength)) + "|\n"
            }
        } else {
            str += "Personne n'a demandé à rejoindre votre guilde.";
        }

        str += "```";
        return str;
    }

    /**
     * 
     */
    deleteGuildAppliances() {
        conn.query("DELETE FROM GuildsAppliances WHERE idGuild = " + this.id);
    }

    /*
     * Static Methods
     * 
     */
    // Apply to a guild
    /**
     * Apply to guild
     * @param {Number} idGuild
     * @param {Number} idCharacter
     * @returns {Array}
     */
    static applyTo(idGuild, idCharacter) {
        let err = [];
        if (this.isGuildExist(idGuild)) {
            if (!this.haveAlreadyApplied(idGuild, idCharacter)) {
                if (!this.haveReachAppliesLimit(idCharacter)) {
                    conn.query("INSERT INTO GuildsAppliances VALUES(" + idGuild + ", " + idCharacter + ")");
                } else {
                    err.push("Vous ne pouvez postuler que pour rejoindre " + Globals.guilds.maxApplies + " guildes maximum en même temps");
                }

            } else {
                err.push("Vous avez déjà postulé pour rejoindre cette guilde.");
            }
        } else {
            err.push("Cette guilde n'existe pas.");
        }
        return err;
    }


    /**
     * Return if guild exist or not
     * @param {Number} idGuild 
     */
    static isGuildExist(idGuild) {
        let res = conn.query("SELECT idGuild FROM Guilds WHERE idGuild = " + idGuild);
        if (res.length > 0) {
            return true;
        }
        return false;
    }

    /**
     * Return if the character have already applied in this guild
     * @param {Number} idGuild
     * @param {Number} idCharacter
     */
    static haveAlreadyApplied(idGuild, idCharacter) {
        let res = conn.query("SELECT idGuild FROM GuildsAppliances WHERE idCharacter = " + idCharacter + " AND idGuild = " + idGuild + ";");
        if (res.length > 0) {
            return true;
        }
        return false;
    }

    /**
     * Static
     * @param {Number} idCharacter
     */
    static haveReachAppliesLimit(idCharacter) {
        return conn.query("SELECT COUNT(*) FROM guildsappliances WHERE idCharacter = " + idCharacter)[0]["COUNT(*)"] >= Globals.guilds.maxApplies ? true : false;
    }


    /**
     * Remove all appliances for a given character
     * @param {Number} idCharacter ID Character
     */
    static deleteUsersAppliances(idCharacter) {
        conn.query("DELETE FROM GuildsAppliances WHERE idCharacter = " + idCharacter);
    }

    /**
     * 
     * @param {any} idCharacter
     * @param {any} idGuild
     */
    static deleteUserForThisGuildAppliance(idCharacter, idGuild) {
        conn.query("DELETE FROM GuildsAppliances WHERE idCharacter = " + idCharacter + " AND idGuild = " + idGuild);
    }

    /**
     * 
     * @param {any} idCharacter
     */
    static getAppliances(idCharacter) {
        let res = conn.query("SELECT guilds.idGuild, nom, level FROM guildsappliances " +
            "INNER JOIN guilds ON guilds.idGuild = guildsappliances.idGuild " +
            "WHERE idCharacter = " + idCharacter);
        let str = "```";
        let idMaxLength = 10;
        let nameMaxLength = 35;
        let levelMaxLength = 11;

        let idLength;
        let nameLength;
        let levelLength;




        if (res.length > 0) {
            str += "|" + "    id    " + "|" + "                nom                " + "|" + "   level   " + "|" + "\n";
            for (let i of res) {
                idLength = i.idGuild.toString().length;
                idLength = (idMaxLength - idLength) / 2;

                nameLength = i.nom.length;
                nameLength = (nameMaxLength - nameLength) / 2;

                levelLength = i.level.toString().length;
                levelLength = (levelMaxLength - levelLength) / 2;

                str += "|" + " ".repeat(Math.floor(idLength)) + i.idGuild + " ".repeat(Math.ceil(idLength)) + "|"
                    + " ".repeat(Math.floor(nameLength)) + i.nom + " ".repeat(Math.ceil(nameLength)) + "|"
                    + " ".repeat(Math.floor(levelLength)) + i.level + " ".repeat(Math.ceil(levelLength)) + "|\n"
            }
        } else {
            str += "Vous ne postulez pas pour rejoindre une guilde.";
        }


        str += "```";
        return str;
    }

    static getGuilds(page) {
        let count = conn.query("SELECT COUNT(*) FROM guilds")[0]["COUNT(*)"];
        let maxPage = Math.ceil(count / 10);

        page = page > maxPage || page <= 0 ? 1 : page;

        let res = conn.query("SELECT idGuild, nom, level FROM guilds ORDER BY level ASC LIMIT 10 OFFSET " + ((page - 1) * 10));

        let str = "```";
        let idMaxLength = 10;
        let nameMaxLength = 35;
        let levelMaxLength = 11;
        let guildmembersMaxLenght = 15;

        let idLength;
        let nameLength;
        let levelLength;
        let guildmembersLenght;

        let maxMembers = 0;

        if (res.length > 0) {
            str += "|" + "    id    " + "|" + "                nom                " + "|" + "   level   " + "|" + "    membres    " + "|" + "\n";
            for (let i of res) {
                count = conn.query("SELECT COUNT(*) FROM guildsmembers WHERE idGuild = " + i.idGuild)[0]["COUNT(*)"];
                maxMembers = (Globals.guilds.baseMembers + (Globals.guilds.membersPerLevels * i.level))

                idLength = i.idGuild.toString().length;
                idLength = (idMaxLength - idLength) / 2;

                nameLength = i.nom.length;
                nameLength = (nameMaxLength - nameLength) / 2;

                levelLength = i.level.toString().length;
                levelLength = (levelMaxLength - levelLength) / 2;

                guildmembersLenght = count.toString().length + 1 + maxMembers.toString().length;
                guildmembersLenght = (guildmembersMaxLenght - guildmembersLenght) / 2;



                str += "|" + " ".repeat(Math.floor(idLength)) + i.idGuild + " ".repeat(Math.ceil(idLength)) + "|"
                    + " ".repeat(Math.floor(nameLength)) + i.nom + " ".repeat(Math.ceil(nameLength)) + "|"
                    + " ".repeat(Math.floor(levelLength)) + i.level + " ".repeat(Math.ceil(levelLength)) + "|"
                    + " ".repeat(Math.floor(guildmembersLenght)) + count + "/" + maxMembers + " ".repeat(Math.ceil(guildmembersLenght)) + "|\n"
            }
        } else {
            str += "Rien à afficher ici.";
        }

        str += "Page " + page + "/" + maxPage;

        str += "```";
        return str;

    }






}

module.exports = Guild;
