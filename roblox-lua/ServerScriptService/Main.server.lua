local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage.Config)
local DataService = require(script.Parent.Services.DataService)
local MissionService = require(script.Parent.Services.MissionService)

local missionEvent = Instance.new("RemoteEvent")
missionEvent.Name = "CompleteMission"
missionEvent.Parent = ReplicatedStorage

local profileEvent = Instance.new("RemoteFunction")
profileEvent.Name = "GetProfile"
profileEvent.Parent = ReplicatedStorage

Players.PlayerAdded:Connect(function(player)
    local profile = DataService.Load(player)
    if Config.IsAdmin(player) then
        profile.Money = Config.MaxMoney
        profile.Gems = Config.MaxGems
        profile.Population = 999999
        DataService.Save(player)
    end
end)

profileEvent.OnServerInvoke = function(player)
    return DataService.Get(player)
end

missionEvent.OnServerEvent:Connect(function(player, missionIndex)
    if MissionService.Complete(player, missionIndex) then
        DataService.Save(player)
    end
end)
