local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local Config = require(game.ReplicatedStorage.Config)

local DataService = {}
local store = DataStoreService:GetDataStore(Config.DataStoreName)
local profiles = {}

local function defaultProfile(player)
    return {
        Name = player.Name,
        Money = Config.StartingMoney,
        Gems = Config.StartingGems,
        Population = 100,
        CommanderLevel = 1,
        XP = 0,
        Prestige = 0,
        BattleWins = 0,
        BattleLosses = 0,
        Units = {Infantry = 0, Armor = 0, Heavy = 0, Jet = 0},
        Factories = {Basic = 0, Advanced = 0, Military = 0},
        CompletedMissions = {},
    }
end

local function sanitize(data, player)
    local profile = defaultProfile(player)
    for key, value in pairs(data or {}) do
        if profile[key] ~= nil then profile[key] = value end
    end
    profile.Name = player.Name
    profile.Money = math.clamp(tonumber(profile.Money) or Config.StartingMoney, 0, Config.MaxMoney)
    profile.Gems = math.clamp(tonumber(profile.Gems) or Config.StartingGems, 0, Config.MaxGems)
    profile.Population = math.max(0, tonumber(profile.Population) or 100)
    return profile
end

function DataService.Load(player)
    local success, data = pcall(function()
        return store:GetAsync("player_" .. player.UserId)
    end)
    profiles[player] = sanitize(success and data or nil, player)
    return profiles[player]
end

function DataService.Get(player)
    return profiles[player]
end

function DataService.Save(player)
    local profile = profiles[player]
    if not profile then return false end
    local success = pcall(function()
        store:UpdateAsync("player_" .. player.UserId, function()
            return profile
        end)
    end)
    return success
end

function DataService.Remove(player)
    DataService.Save(player)
    profiles[player] = nil
end

Players.PlayerRemoving:Connect(DataService.Remove)

task.spawn(function()
    while task.wait(60) do
        for player in pairs(profiles) do
            if player.Parent then DataService.Save(player) end
        end
    end
end)

return DataService
