local Config = {}

Config.DataStoreName = "OperationAcier_PlayerData_v1"
Config.AdminUserIds = {
    0, -- Remplace 0 par ton UserId Roblox.
}
Config.StartingMoney = 2000
Config.StartingGems = 25
Config.MaxMoney = 999999999
Config.MaxGems = 999999
Config.MissionCount = 20

Config.Locations = {
    {Id = "Shop", Label = "BOUTIQUE", Position = Vector3.new(-90, 2, -48), Color = Color3.fromRGB(232, 163, 61)},
    {Id = "Market", Label = "MARCHE", Position = Vector3.new(90, 2, -48), Color = Color3.fromRGB(79, 195, 201)},
    {Id = "Command", Label = "COMMANDEMENT", Position = Vector3.new(-100, 2, 55), Color = Color3.fromRGB(127, 174, 92)},
    {Id = "Missions", Label = "MISSIONS", Position = Vector3.new(100, 2, 55), Color = Color3.fromRGB(232, 163, 61)},
    {Id = "Clan", Label = "QG CLAN", Position = Vector3.new(-35, 2, -105), Color = Color3.fromRGB(193, 71, 59)},
    {Id = "Ranking", Label = "CLASSEMENT", Position = Vector3.new(35, 2, -105), Color = Color3.fromRGB(169, 166, 144)},
}

function Config.IsAdmin(player)
    for _, userId in ipairs(Config.AdminUserIds) do
        if player.UserId == userId then
            return true
        end
    end
    return false
end

return Config
