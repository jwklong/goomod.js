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

type GoomodArgs = {
    id: string,
    name: string,
    type?: "level" | "mod",
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

    async generate(filename: string = this.id, genName: string = this.id + "_goomod") {
        var genPath = path.join(this.#dirname, genName)
        var genEnd = path.join(this.#dirname, filename + ".goomod")

        if (fs.existsSync(genPath)) fs.rmSync(genPath, { recursive: true, force: true })
        fs.mkdirSync(genPath)

        //addin.xml
        const addinXML = XMLBuilder.create()
            .ele("addin", {"spec-version": "1.1"})
                .ele("id").txt(this.id).up()
                .ele("name").txt(this.name).up()
                .ele("type").txt(this.type).up()
                .ele("version").txt(this.version.join(".")).up()
                .ele("description").txt(this.desc).up()
                .ele("author").txt(this.author).up()
            .end({prettyPrint: true})
        fs.writeFileSync(path.join(genPath, 'addin.xml'), addinXML)

        //resources
        if (this.imageResources !== undefined) {
            fs.cpSync(this.#imageResourcePath, path.join(genPath, "override", "res", "images"), { recursive: true })

            //copy everything from resources
            let resourcesXSL = XMLBuilder.create()
                .ele("xsl:transform")
                    .ele("xsl:template", {"match": "* | comment()"})
                        .ele("xsl:copy")
                            .ele("xsl:copy-of", {"select": "@*"}).up()
                            .ele("xsl:apply-template").up()
                        .up()
                    .up()
            
            //write new resources
            resourcesXSL = resourcesXSL
                    .ele("xsl:template", {"match": "//Resources[@id='common']"})
                        .ele("xsl:copy").up()
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

        if (fs.existsSync(genEnd)) fs.rmSync(genEnd)
        await zip(genPath, genEnd)
    }
}