﻿'use strict';
const conn = require("../../conf/mysql.js");
const WildArea = require("./WildArea.js");
const CityArea = require("./CityArea.js");
const DungeonArea = require("./DungeonArea");
const Globals = require("../Globals.js");
const Discord = require("discord.js");
const Translator = require("../Translator/Translator");
const Graph = require('node-dijkstra');
const Region = require("./Region");


class AreasManager {


    constructor() {
        this.areas = new Map();
        this.regions = {};
        this.paths = new Graph();
        this.pathsGoldCosts = new Graph();
    }

    async loadAreasManager() {
        await this.loadRegions();
        await Promise.all([
            this.loadAreas(),
            this.loadPaths()
        ]);
        await this.loadConnectedAreas();
    }

    async loadConnectedAreas() {
        for (let rk of Object.keys(this.regions)) {
            let res = await conn.query("SELECT idArea2 as idArea FROM areaspaths WHERE areaspaths.idArea1 IN (SELECT idArea FROM areasregions WHERE areasregions.idRegion = ?) AND areaspaths.idArea2 NOT IN (SELECT idArea FROM areasregions WHERE areasregions.idRegion = ?)", [rk, rk]);
            for (let find of res) {
                this.regions[rk].addConnectedArea(this.areas.get(find.idArea));
            }
        }
    }

    async loadRegions() {
        let res = await conn.query("SELECT idRegion FROM regions");
        for (let region of res) {
            this.regions[region.idRegion] = new Region(region.idRegion);
        }
    }

    async loadAreas() {
        let res = await conn.query("SELECT areas.idArea, NomAreaType, idRegion FROM areas INNER JOIN areastypes ON areastypes.idAreaType = areas.idAreaType INNER JOIN areasregions ON areasregions.idArea = areas.idArea INNER JOIN areasmonsterslevels ON areasmonsterslevels.idArea = areas.idArea ORDER BY areasmonsterslevels.minLevel ASC, areasmonsterslevels.maxLevel ASC, idArea");
        let area;
        for (let i in res) {
            switch (res[i].NomAreaType) {
                case "wild":
                    area = new WildArea(res[i].idArea);
                    break;
                case "city":
                    area = new CityArea(res[i].idArea);
                    break;
                case "dungeon":
                    area = new DungeonArea(res[i].idArea);
                    break;
            }
            await area.loadArea();
            this.areas.set(res[i].idArea, area);
            this.regions[res[i].idRegion].addArea(this.areas.get(res[i].idArea));
        }
    }

    async loadPaths() {
        let res = await conn.query("SELECT DISTINCT idArea1 FROM areaspaths");
        for (let area of res) {
            let paths = await conn.query("SELECT * FROM areaspaths WHERE idArea1 = ?", [area.idArea1]);
            let node = {};
            let nodeGold = {};
            for (let path of paths) {
                //console.log(path.idArea1 + " -> " + path.idArea2 + " | cost : " + path.time);
                node[path.idArea2] = path.time;
                nodeGold[path.idArea2] = path.goldPrice + 1;
            }
            this.paths.addNode(area.idArea1.toString(), node);
            this.pathsGoldCosts.addNode(area.idArea1.toString(), nodeGold);
        }
    }

    /**
     * 
     * @param {string} from 
     * @param {string} to 
     */
    getPathCosts(from, to) {
        let path = this.paths.path(from.toString(), to.toString(), {
            cost: true
        });
        let pathGold = this.pathsGoldCosts.path(from.toString(), to.toString(), {
            cost: true
        });
        let toReturn = {
            timeToWait: path.cost,
            goldPrice: pathGold.cost - (pathGold.path.length - 1)
        }
        return toReturn;
    }

    /**
     * 
     * @param {number} idArea 
     * @param {number} idEnemy 
     * @param {number} perception 
     * @returns {boolean}
     */
    canIFightThisMonster(idArea, idEnemy, perception) {
        let monsterID = this.areas.get(idArea).getMonsterId(idEnemy);
        if (monsterID) {
            let bonus = 1 + (perception / 100);
            let chance = Math.random();
            if (chance <= Globals.chanceToFightTheMonsterYouWant * bonus) {
                return true;
            }
        }

        return false;
    }

    /**
     * 
     * @param {number} idArea 
     * @param {string} serviceName 
     */
    getService(idArea, serviceName) {
        return this.areas.get(idArea).getService(serviceName);
    }

    /**
     * 
     * @param {number} idArea 
     * @param {number} idEnemy 
     */
    selectRandomMonsterIn(idArea, idEnemy) {
        return this.areas.get(idArea).getRandomMonster(idEnemy);
    }

    /**
     * 
     * @param {number} idArea 
     * @param {number} idEnemy 
     */
    getMonsterIdIn(idArea, idEnemy) {
        return this.areas.get(idArea).getMonsterId(idEnemy);
    }

    async thisAreaToApi(idArea, lang) {
        let area = this.areas.get(idArea)
        return await area.toApi(lang);
    }

    async thisRegionToApi(currentArea, lang) {
        return await this.regions[currentArea.idRegion].toApi(lang);
    }

    canISellToThisArea(idArea) {
        if (this.areas.get(idArea).areaType == "city") {
            return true;
        }
        return false;
    }

    canIFightInThisArea(idArea) {
        return this.areas.get(idArea).canIFightHere();
    }

    exist(idArea) {
        if (this.areas.get(idArea)) {
            return true;
        }
        return false;
    }

    existInRegion(idRegion, index) {
        if (this.regions[idRegion]) {
            return this.regions[idRegion].exist(index);
        }
        return false;
    }

    isConnectedToRegion(idRegion, index) {
        if (this.regions[idRegion]) {
            return this.regions[idRegion].isConnected(index);
        }
        return false;
    }

    // Single Getters for an area

    getNameOf(idArea, lang) {
        return this.areas.get(idArea).getName(lang);
    }

    async getPlayersOf(idArea, page, lang) {
        let area = this.areas.get(idArea);
        return await area.getPlayers(page, lang);
    }

    getResources(idArea) {
        return this.areas.get(idArea).getResources();
    }

    getResource(idArea, index) {
        return this.areas.get(idArea).getResource(index);
    }

    getAreaForThisRegion(idRegion, index) {
        return this.regions[idRegion].getArea(index);
    }

    getConnectedAreaForThisRegion(idRegion, index) {
        return this.regions[idRegion].getConnectedArea(index);
    }

    /*
     *   CONQUEST
     */
    async claim(idArea, idGuild) {
        let area = this.areas.get(idArea);
        return await area.claim(idGuild);
    }

    async unclaimAll(idGuild) {
        for (let [key, value] of this.areas) {
            if (this.areas.get(key).owner == idGuild) {
                let area = this.areas.get(key);
                await area.unclaim();
            }
        }
    }

    async haveOwner(idArea) {
        let area = this.areas.get(idArea);
        return await area.haveOwner();
    }

    getArea(idArea) {
        return this.areas.get(idArea);
    }

    /*
     * API
     */
    async toApi(actualArea) {
        let areas = {};
        for (let i in Globals.areasTypes) {
            areas[Globals.areasTypes[i]] = [];
        }

        for (let [key, value] of this.areas) {
            let area = this.areas.get(key);
            areas[this.areas.get(key).areaType].push(await area.toApiLight());
            if (key == actualArea) {
                areas[this.areas.get(key).areaType][areas[this.areas.get(key).areaType].length - 1].actual = true;
            } else {
                areas[this.areas.get(key).areaType][areas[this.areas.get(key).areaType].length - 1].actual = false;
            }
        }
        return areas;
    }

    async toApiThisAreaFull(idArea) {
        if (this.areas.get(idArea)) {
            let area = this.areas.get(idArea);
            return await area.toApiFull();
        }
        return null;
    }


}

module.exports = AreasManager;