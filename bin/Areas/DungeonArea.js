﻿'use strict';
const Area = require("./Area");

class DungeonArea extends Area {

    constructor(id) {
        super(id, id);
        this.fightPossible = true;
        this.authorizedBonuses = ["xp_fight", "xp_collect", "gold_drop", "item_drop", "collect_drop"];
    }
}

module.exports = DungeonArea;