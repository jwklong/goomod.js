import fs from 'fs'
import { arch } from 'os'
import path from 'path'
import * as XMLBuilder from 'xmlbuilder2'
import { zip } from 'zip-a-folder'

function ensureDirectoryExistence(filePath) {
    var dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

// ENUMS

export enum OCDType {
    BallsCollected = "balls",
    Moves = "moves",
    TimeSpent = "time"
}

export enum GoomodType {
    Generic = "mod",
    Levels = "level"
}

// LEVEL

type LevelOCD = {
    type: OCDType
    amount: number
}

type LevelArgs = {
    id: string
    name?: string
    desc?: string
    ocd?: LevelOCD
}

export class Level {
    id: string
    name: string
    desc: string
    ocd?: LevelOCD

    constructor(args: LevelArgs) {
        this.id = args.id
        this.name = args.name || this.id
        this.desc = args.desc || ""
        this.ocd = this.ocd
    }
}

// GOOMOD

type GoomodArgs = {
    id: string,
    name: string,
    type?: GoomodType
    version?: number[] & [number], //ensure length of 1
    desc: string,
    author: string
}

export class Goomod {
    id: string
    name: string
    type: "level" | "mod"
    version: number[] & [number]
    desc: string
    author: string

    #dirname: string

    #imageResourcePath: string
    imageResources?: {[key: string]: string}

    #levels: Level[] = []

    constructor(dirname, args: GoomodArgs) {
        this.id = args.id
        this.name = args.name
        this.type = args.type || "mod"
        this.version = args.version || [0]
        this.desc = args.desc
        this.author = args.author

        this.#dirname = dirname
    }

    async registerImageResources(folderPath: string) {
        if (this.#imageResourcePath !== undefined) throw Error("Cannot redefine image resources")

        folderPath = path.join(this.#dirname, folderPath)
        const keys = fs.readdirSync(folderPath, { recursive: true, withFileTypes: true })
            .filter(x => !x.isDirectory())
            .map(x => path.join(x.path, x.name).substring(folderPath.length+1))
            .map(x => x.substring(0, x.length - x.split(".").pop().length - 1))
            .map(x => [
                x,
                `IMAGE_GLOBAL_${[...this.id.matchAll(/[A-z]/g)].join("").toUpperCase()}_${[...x.matchAll(/[A-z/]/g)].join("").replaceAll("/", "_").toUpperCase()}`
            ])
        this.imageResources = Object.fromEntries(keys)
        this.#imageResourcePath = folderPath
    }

    appendLevel(level: Level) {
        this.#levels.push(level)
    }

    /* dunno if i REALLY want this, will keep in mind
    get levels() {
        return this.#levels
    }
    */

    async generate(filename: string = this.id, genName: string = this.id + "_goomod") {
        var genPath = path.join(this.#dirname, genName)
        var genEnd = path.join(this.#dirname, filename + ".goomod")

        if (fs.existsSync(genPath)) fs.rmSync(genPath, { recursive: true, force: true })
        fs.mkdirSync(genPath)

        //addin.xml
        let addinXML = XMLBuilder.create()
            .ele("addin", {"spec-version": "1.1"})
                .ele("id").txt(this.id).up()
                .ele("name").txt(this.name).up()
                .ele("type").txt(this.type).up()
                .ele("version").txt(this.version.join(".")).up()
                .ele("description").txt(this.desc).up()
                .ele("author").txt(this.author).up()

        if (this.type === "level" && this.#levels.length >= 1) {
            addinXML = addinXML
                .ele("levels")
            
            for (var level of this.#levels) {
                addinXML = addinXML
                    .ele("level")
                        .ele("dir").txt(level.id).up()
                        .ele("name", {"text": level.name}).up()
                        .ele("subtitle", {"text": level.desc}).up()
                if (level.ocd !== undefined) {
                    addinXML = addinXML
                        .ele("ocd").txt(`${level.ocd}`).up()
                }
                addinXML = addinXML
                    .up()
            }
        }
        
        fs.writeFileSync(path.join(genPath, 'addin.xml'), addinXML.end({prettyPrint: true}))

        //resources
        if (this.imageResources !== undefined) {
            fs.cpSync(this.#imageResourcePath, path.join(genPath, "override", "res", "images"), { recursive: true })

            //copy everything from resources
            let resourcesXSL = XMLBuilder.create()
                .ele("xsl:transform", {"version": "1.0", "xmlns:xsl": "http://www.w3.org/1999/XSL/Transform"})
                    .ele("xsl:template", {"match": "* | comment()"})
                        .ele("xsl:copy")
                            .ele("xsl:copy-of", {"select": "@*"}).up()
                            .ele("xsl:apply-templates").up()
                        .up()
                    .up()
            
            //write new resources
            resourcesXSL = resourcesXSL
                    .ele("xsl:template", {"match": "//Resources[@id='common']"})
                        .ele("xsl:copy")
                            .ele("xsl:copy-of", {"select": "@*"}).up()
                            .ele("xsl:apply-templates").up()
                            .ele("SetDefaults", {"idprefix": "", "path": "./res/images"}).up()
            for (var i of Object.keys(this.imageResources)) {
                var v = this.imageResources[i]
                resourcesXSL.ele("Image", {id: v, path: i}).up()
            }
            
            //clean up
            var filename = path.join(genPath, 'merge', 'properties', 'resources.xml.xsl')
            ensureDirectoryExistence(filename)
            fs.writeFileSync(filename, resourcesXSL.end({prettyPrint: true}))
        }

        //levels
        for (var level of this.#levels) {
            var levelPath = path.join(genPath, 'compile', 'res', 'levels', level.id)
            ensureDirectoryExistence(path.join(levelPath, 'nothing'))

            //.level.xml
            var levelXML = XMLBuilder.create()
                .ele("level")

            fs.writeFileSync(path.join(levelPath, `${level.id}.level.xml`), levelXML.end({prettyPrint: true}))

            //.scene.xml
            var sceneXML = XMLBuilder.create()
                .ele("scene")

            fs.writeFileSync(path.join(levelPath, `${level.id}.scene.xml`), sceneXML.end({prettyPrint: true}))
        }

        if (fs.existsSync(genEnd)) fs.rmSync(genEnd)
        await zip(genPath, genEnd)
    }
}