package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL             string
	ServerPort              string
	EncryptionKey           string
	ScheduleAM              string
	SchedulePM              string
	SyncOnStartup           bool
	SyncStartupDelaySeconds int
	AdminUsername           string
	AdminPassword           string
	SessionSecret           string
	AllowCustomCommands     bool
}

func Load() *Config {
	return &Config{
		DatabaseURL:             getEnv("DATABASE_URL", "postgres://amr:amr@localhost:5432/amrdashboard?sslmode=disable"),
		ServerPort:              getEnv("SERVER_PORT", "8080"),
		EncryptionKey:           getEnv("ENCRYPTION_KEY", "change-this-32-byte-secret-key!!"),
		ScheduleAM:              getEnv("SCHEDULE_AM", "0 6 * * *"),
		SchedulePM:              getEnv("SCHEDULE_PM", "0 18 * * *"),
		SyncOnStartup:           getEnvBool("SYNC_ON_STARTUP", false),
		SyncStartupDelaySeconds: getEnvInt("SYNC_STARTUP_DELAY_SECONDS", 20),
		AdminUsername:           getEnv("ADMIN_USERNAME", "admin"),
		AdminPassword:           getEnv("ADMIN_PASSWORD", "admin"),
		SessionSecret:           getEnv("SESSION_SECRET", getEnv("ENCRYPTION_KEY", "change-this-32-byte-secret-key!!")),
		AllowCustomCommands:     getEnvBool("ALLOW_CUSTOM_COMMANDS", false),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return parsed
}
