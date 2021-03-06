const GModule = require("../GModule");
const Discord = require("discord.js");
const User = require("../../User");
const conn = require("../../../conf/mysql");
const Globals = require("../../Globals");
const LootSystem = require("../../LootSystem");
const AreasManager = require("../../Areas/AreasManager");
const Guild = require("../../Guild");
const Group = require("../../Group");
const Fight = require("../../Fight/Fight");
const Monster = require("../../Entities/Monster");
const Translator = require("../../Translator/Translator");
const CraftSystem = require("../../CraftSystem/CraftSystem");
const AreaTournament = require("../../AreaTournament/AreaTournament");
const PStatistics = require("../../Achievement/PStatistics");
const Craft = require("../../CraftSystem/Craft");
const Item = require("../../Items/Item");
const Emojis = require("../../Emojis");
const Character = require("../../Character");
const express = require("express");


class FightModule extends GModule {
    constructor() {
        super();
        this.commands = ["fight", "arena"];
        this.startLoading("Fight");
        this.init();
        this.endLoading("Fight");
    }

    init() {
        this.router = express.Router();
        this.loadNeededVariables();
        this.router.use((req, res, next) => {
            PStatistics.incrStat(Globals.connectedUsers[res.locals.id].character.id, "commands_fights", 1);
            next();
        });
        this.reactHandler();
        this.loadRoutes();
        this.freeLockedMembers();
        this.crashHandler();
    }

    loadRoutes() {
        this.router.post("/monster", async (req, res, next) => {
            let data = {}
            let idEnemy = parseInt(req.body.idMonster, 10);
            if (Globals.areasManager.canIFightInThisArea(Globals.connectedUsers[res.locals.id].character.getIdArea())) {
                if (idEnemy != null && Number.isInteger(idEnemy)) {
                    if (res.locals.currentArea.getMonsterId(idEnemy) != null) {
                        let canIFightTheMonster = Globals.areasManager.canIFightThisMonster(Globals.connectedUsers[res.locals.id].character.getIdArea(), idEnemy, Globals.connectedUsers[res.locals.id].character.getStat("perception"));
                        let enemies = [];
                        if (!canIFightTheMonster) {
                            enemies = Globals.areasManager.selectRandomMonsterIn(Globals.connectedUsers[res.locals.id].character.getIdArea(), idEnemy);
                        } else {
                            enemies = Globals.areasManager.getMonsterIdIn(Globals.connectedUsers[res.locals.id].character.getIdArea(), idEnemy);
                        }
                        let response = await Globals.fightManager.fightPvE([Globals.connectedUsers[res.locals.id].character], enemies, res.locals.id, canIFightTheMonster, res.locals.lang);
                        if (response.error) {
                            data.error = response.error;
                        } else {
                            data = response;

                            // Achiev linked to monsters fights
                            switch (Globals.connectedUsers[res.locals.id].character.getIdArea()) {
                                case 33:
                                    if (response.summary.winner === 0) {
                                        await Globals.connectedUsers[res.locals.id].character.getAchievements().unlock(2, Globals.connectedUsers[res.locals.id]);
                                    }
                            }
                        }
                    } else {
                        data.error = Translator.getString(res.locals.lang, "errors", "fight_monter_dont_exist");
                    }
                } else {
                    // Error Message
                    data.error = Translator.getString(res.locals.lang, "errors", "fight_enter_id_monster");
                }
            } else {
                data.error = Translator.getString(res.locals.lang, "errors", "fight_impossible_in_town");
            }



            data.lang = res.locals.lang;
            await next();
            return res.json(data);
        });

        this.router.post("/arena", async (req, res, next) => {
            let data = {}
            let idOtherPlayerCharacter = 0;
            let mId = -1;
            let response;

            // Ici on récupère l'id
            if (req.body.mention) {
                mId = req.body.mention;
            } else if (req.body.idCharacter) {
                idOtherPlayerCharacter = parseInt(req.body.idCharacter, 10);
                if (idOtherPlayerCharacter && Number.isInteger(idOtherPlayerCharacter)) {
                    mId = await User.getIDByIDCharacter(idOtherPlayerCharacter);
                }
            } else {
                // useless
                data.error = Translator.getString(res.locals.lang, "errors", "fight_pvp_choose_enemy");
            }
            // Ici on lance le combat si connecté
            if (Globals.connectedUsers[mId]) {
                if (res.locals.id !== mId) {
                    response = await Globals.fightManager.fightPvP([Globals.connectedUsers[res.locals.id].character], [Globals.connectedUsers[mId].character], res.locals.id, res.locals.lang);
                    if (response.error != null) {
                        data.error = response.error;
                    } else {
                        data = response;
                    }
                } else {
                    data.error = Translator.getString(res.locals.lang, "errors", "fight_pvp_cant_fight_yourself");
                }

            } else {
                if (mId != -1 && await User.exist(mId)) {
                    if (res.locals.id !== mId) {
                        if (Globals.connectedUsers[res.locals.id].character.canDoAction()) {
                            let notConnectedEnemy = new User(mId);
                            await notConnectedEnemy.loadUser();
                            notConnectedEnemy.character.setArea(Globals.areasManager.getArea(notConnectedEnemy.character.idArea));

                            response = await Globals.fightManager.fightPvP([Globals.connectedUsers[res.locals.id].character], [notConnectedEnemy.character], res.locals.id, res.locals.lang);

                            if (response.error != null) {
                                data.error = response.error;
                            } else {
                                data = response;
                            }
                        } else {
                            data.error = Translator.getString(res.locals.lang, "errors", "generic_tired", [Globals.connectedUsers[res.locals.id].character.getExhaust()]);
                        }
                    } else {
                        data.error = Translator.getString(res.locals.lang, "errors", "fight_pvp_cant_fight_yourself");
                    }
                } else {
                    data.error = Translator.getString(res.locals.lang, "errors", "fight_pvp_not_same_area");
                }
            }



            data.lang = res.locals.lang;
            await next();
            return res.json(data);
        });

    }

}

module.exports = FightModule;