local Config = require(game.ReplicatedStorage.Config)
local DataService = require(script.Parent.DataService)

local EconomyService = {}

function EconomyService.SetAdminResources(player)
    if not Config.IsAdmin(player) then return false end
    local profile = DataService.Get(player)
    if not profile then return false end
    profile.Money = Config.MaxMoney
    profile.Gems = Config.MaxGems
    profile.Population = 999999
    return true
end

function EconomyService.AddMoney(player, amount)
    local profile = DataService.Get(player)
    amount = tonumber(amount) or 0
    if not profile or amount < 0 then return false end
    profile.Money = math.clamp(profile.Money + amount, 0, Config.MaxMoney)
    return true
end

return EconomyService
