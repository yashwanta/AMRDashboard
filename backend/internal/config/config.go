package config

import (
	"os"
)

type Config struct {
	DatabaseURL    string
	ServerPort     string
	EncryptionKey  string
	ScheduleAM     string
	SchedulePM     string
}

func Load() *Config {
	return &Config{
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://amr:amr@localhost:5432/amrdashboard?sslmode=disable"),
		ServerPort:    getEnv("SERVER_PORT", "8080"),
		EncryptionKey: getEnv("ENCRYPTION_KEY", "change-this-32-byte-secret-key!!"),
		ScheduleAM:    getEnv("SCHEDULE_AM", "0 6 * * *"),
		SchedulePM:    getEnv("SCHEDULE_PM", "0 18 * * *"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
