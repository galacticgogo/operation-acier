local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage.Config)
local DataService = require(script.Parent.Services.DataService)
local EconomyService = require(script.Parent.Services.EconomyService)

local commandEvent = ReplicatedStorage:FindFirstChild("AdminCommand") or Instance.new("RemoteEvent")
commandEvent.Name = "AdminCommand"
commandEvent.Parent = ReplicatedStorage

local unitNames = {Infantry = true, Armor = true, Heavy = true, Jet = true}
local function findPlayer(value)
    local wanted = string.lower(tostring(value or ""))
    for _, player in ipairs(Players:GetPlayers()) do
        if string.lower(player.Name) == wanted or string.lower(player.DisplayName) == wanted then
            return player
        end
    end
    return nil
end

local function number(value, minimum)
    local result = tonumber(value)
    if not result or result < (minimum or 0) then return nil end
    return math.floor(result)
end

local function respond(player, ok, message)
    commandEvent:FireClient(player, "result", ok, message)
end

local function execute(player, raw)
    if not Config.IsAdmin(player) then return respond(player, false, "Acces admin refuse.") end
    local parts = string.split(string.gsub(tostring(raw or ""), "%s+", " "), " ")
    local verb = string.lower(parts[1] or "")
    local subject = string.lower(parts[2] or "")

    if verb == "infinite" then
        EconomyService.SetAdminResources(player)
        DataService.Save(player)
        return respond(player, true, "Ressources admin illimitees appliquees.")
    end

    if verb == "list" and subject == "accounts" then
        local lines = {}
        for _, target in ipairs(Players:GetPlayers()) do
            local profile = DataService.Get(target)
            table.insert(lines, string.format("%s: argent=%d population=%d", target.Name, profile.Money, profile.Population))
        end
        return respond(player, true, table.concat(lines, "\n"))
    end

    if verb == "reset" and subject == "all" then
        for _, target in ipairs(Players:GetPlayers()) do
            if not Config.IsAdmin(target) then
                local profile = DataService.Get(target)
                profile.Money = Config.StartingMoney
                profile.Gems = Config.StartingGems
                profile.Population = 100
                profile.XP = 0
                profile.CommanderLevel = 1
                profile.CompletedMissions = {}
                DataService.Save(target)
            end
        end
        return respond(player, true, "Tous les joueurs en ligne ont ete reinitialises.")
    end

    if verb == "wipe" and subject == "all" then
        for _, target in ipairs(Players:GetPlayers()) do
            if not Config.IsAdmin(target) then
                local profile = DataService.Get(target)
                profile.Money = 0
                profile.Gems = 0
                profile.Population = 0
                profile.XP = 0
                profile.CommanderLevel = 1
                profile.CompletedMissions = {}
                profile.Units = {Infantry = 0, Armor = 0, Heavy = 0, Jet = 0}
                profile.Factories = {Basic = 0, Advanced = 0, Military = 0}
                DataService.Save(target)
            end
        end
        return respond(player, true, "Donnees des joueurs en ligne effacees.")
    end

    local target = findPlayer(parts[3])
    if not target then return respond(player, false, "Joueur en ligne introuvable.") end
    if Config.IsAdmin(target) and verb ~= "get" then return respond(player, false, "Le compte admin est protege.") end
    local profile = DataService.Get(target)
    local category = subject
    local amount = number(parts[4])

    if verb == "get" then
        return respond(player, true, string.format("%s: argent=%d gemmes=%d population=%d xp=%d niveau=%d", target.Name, profile.Money, profile.Gems, profile.Population, profile.XP, profile.CommanderLevel))
    elseif verb == "give" and category == "money" and amount then
        profile.Money = math.clamp(profile.Money + amount, 0, Config.MaxMoney)
    elseif verb == "give" and category == "gems" and amount then
        profile.Gems = math.clamp(profile.Gems + amount, 0, Config.MaxGems)
    elseif verb == "give" and category == "xp" and amount then
        profile.XP += amount
    elseif verb == "give" and category == "units" and unitNames[parts[4]] and number(parts[5]) then
        profile.Units[parts[4]] = (profile.Units[parts[4]] or 0) + number(parts[5])
    elseif verb == "set" and category == "money" and amount then
        profile.Money = math.clamp(amount, 0, Config.MaxMoney)
    elseif verb == "set" and category == "gems" and amount then
        profile.Gems = math.clamp(amount, 0, Config.MaxGems)
    elseif verb == "set" and category == "xp" and amount then
        profile.XP = amount
    elseif verb == "set" and category == "level" and amount then
        profile.CommanderLevel = amount
    elseif verb == "set" and category == "population" and amount then
        profile.Population = amount
    elseif verb == "set" and category == "units" and unitNames[parts[4]] and number(parts[5]) then
        profile.Units[parts[4]] = number(parts[5])
    elseif verb == "reset" then
        profile.Money = Config.StartingMoney
        profile.Gems = Config.StartingGems
        profile.Population = 100
        profile.XP = 0
        profile.CommanderLevel = 1
        profile.CompletedMissions = {}
    elseif verb == "delete" then
        target:Kick("Compte supprime par administration")
        return respond(player, true, target.Name .. " a ete deconnecte. La suppression DataStore necessite une confirmation Studio.")
    else
        return respond(player, false, "Commande invalide ou parametres manquants.")
    end

    DataService.Save(target)
    respond(player, true, "Commande appliquee a " .. target.Name .. ".")
end

commandEvent.OnServerEvent:Connect(function(player, command, targetUserId, amount)
    if typeof(command) == "string" and (targetUserId == nil or typeof(targetUserId) == "number") then
        if command == "infinite" then
            execute(player, "infinite")
        elseif command == "giveMoney" then
            execute(player, string.format("give money %s %s", tostring(targetUserId), tostring(amount)))
        else
            execute(player, command)
        end
    end
end)
