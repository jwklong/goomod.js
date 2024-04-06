import fs from 'fs'
import { arch } from 'os'
import path from 'path'
import * as XMLBuilder from 'xmlbuilder2'
import { zip } from 'zip-a-folder'

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

    constructor(dirname, args: GoomodArgs) {
        this.id = args.id
        this.name = args.name
        this.type = args.type || "mod"
        this.version = args.version || [0]
        this.desc = args.desc
        this.author = args.author

        this.#dirname = dirname
    }

    async generate(filename: string = this.id, genName: string = this.id + "_goomod") {
        var genPath = path.join(this.#dirname, genName)
        var genEnd = path.join(this.#dirname, filename + ".goomod")

        if (fs.existsSync(genPath)) fs.rmdirSync(genPath)
        fs.mkdirSync(genPath)

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

        if (fs.existsSync(genEnd)) fs.rmSync(genEnd)
        await zip(genPath, genEnd)
    }
}