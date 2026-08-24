local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage.Config)
local DataService = require(script.Parent.Services.DataService)
local EconomyService = require(script.Parent.Services.EconomyService)

local event = Instance.new("RemoteEvent")
event.Name = "AdminCommand"
event.Parent = ReplicatedStorage

event.OnServerEvent:Connect(function(player, command, targetUserId, amount)
    if not Config.IsAdmin(player) then return end
    local target = game.Players:GetPlayerByUserId(tonumber(targetUserId) or player.UserId)
    if not target then return end
    local profile = DataService.Get(target)
    if command == "infinite" and target == player then
        EconomyService.SetAdminResources(player)
    elseif command == "giveMoney" and profile then
        EconomyService.AddMoney(target, amount)
    end
    DataService.Save(target)
end)
