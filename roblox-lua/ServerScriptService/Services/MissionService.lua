local Config = require(game.ReplicatedStorage.Config)
local DataService = require(script.Parent.DataService)

local MissionService = {}

function MissionService.GetMission(index)
    index = tonumber(index) or 1
    if index < 1 or index > Config.MissionCount then return nil end
    return {
        Id = index,
        Name = "Secteur " .. index,
        Reward = 60 * index,
        Power = math.floor(25 * (1.25 ^ (index - 1))),
    }
end

function MissionService.Complete(player, index)
    local profile = DataService.Get(player)
    local mission = MissionService.GetMission(index)
    if not profile or not mission or profile.CompletedMissions[tostring(index)] then return false end
    profile.CompletedMissions[tostring(index)] = true
    profile.Money = math.clamp(profile.Money + mission.Reward, 0, Config.MaxMoney)
    profile.XP += 40 + index * 6
    profile.BattleWins += 1
    return true
end

return MissionService
