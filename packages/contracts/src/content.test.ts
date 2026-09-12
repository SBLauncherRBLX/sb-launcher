import {describe,it,expect} from "vitest";
import {matchServers,ContentDataSchema} from "./content";
import {DEFAULT_THEME,normalizeTheme} from "./index";
describe("server matching",()=>{
  const rows=[{id:"unknown",playing:1,maxPlayers:10,ping:null,fps:null},{id:"full",playing:10,maxPlayers:10,ping:20,fps:60},{id:"fast",playing:2,maxPlayers:10,ping:40,fps:59},{id:"slow",playing:8,maxPlayers:10,ping:200,fps:30}];
  const filter={maxPing:0,minFps:0,minFree:1,maxOccupancy:100,sort:"ping" as const};
  it("keeps unknown metrics only without enabled thresholds and excludes full servers",()=>{expect(matchServers(rows,filter).map(x=>x.id)).toEqual(["fast","slow","unknown"]);expect(matchServers(rows,{...filter,maxPing:80,minFps:55}).map(x=>x.id)).toEqual(["fast"]);});
  it("deduplicates pages and applies occupancy and free slots",()=>{expect(matchServers([...rows,rows[2]!],{...filter,maxOccupancy:50,minFree:8})).toHaveLength(2);});
});
it("migrates old themes to multicolor and preserves a custom color on export/import",()=>{const {iconColorMode,iconColor,...old}=DEFAULT_THEME;expect(normalizeTheme(old).iconColorMode).toBe("multicolor");expect(normalizeTheme(JSON.parse(JSON.stringify({...old,iconColorMode:"custom",iconColor:"#12abef"}))).iconColor).toBe("#12abef");});
it("creates a valid empty content document",()=>{expect(ContentDataSchema.parse({})).toEqual({collections:[],games:[],journal:[],filters:[]});});
