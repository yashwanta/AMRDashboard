package config

import (
	"os"
)

type Config struct {
	DatabaseURL         string
	ServerPort          string
	EncryptionKey       string
	ScheduleAM          string
	SchedulePM          string
	AdminUsername       string
	AdminPassword       string
	SessionSecret       string
	AllowCustomCommands bool
}

func Load() *Config {
	return &Config{
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://amr:amr@localhost:5432/amrdashboard?sslmode=disable"),
		ServerPort:          getEnv("SERVER_PORT", "8080"),
		EncryptionKey:       getEnv("ENCRYPTION_KEY", "change-this-32-byte-secret-key!!"),
		ScheduleAM:          getEnv("SCHEDULE_AM", "0 6 * * *"),
		SchedulePM:          getEnv("SCHEDULE_PM", "0 18 * * *"),
		AdminUsername:       getEnv("ADMIN_USERNAME", "admin"),
		AdminPassword:       getEnv("ADMIN_PASSWORD", "admin"),
		SessionSecret:       getEnv("SESSION_SECRET", getEnv("ENCRYPTION_KEY", "change-this-32-byte-secret-key!!")),
		AllowCustomCommands: getEnv("ALLOW_CUSTOM_COMMANDS", "") == "true",
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
