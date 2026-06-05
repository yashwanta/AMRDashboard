package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/yashwanta/AMRDashboard/internal/api"
	"github.com/yashwanta/AMRDashboard/internal/api/handlers"
	"github.com/yashwanta/AMRDashboard/internal/config"
	"github.com/yashwanta/AMRDashboard/internal/db"
	"github.com/yashwanta/AMRDashboard/internal/scheduler"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	// Run migrations
	if _, err := pool.Exec(context.Background(), db.Schema); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Println("database ready")

	// Setup scheduler
	sched := scheduler.New()
	syncH := handlers.NewSyncHandler(pool, cfg.EncryptionKey)

	if err := sched.Add(cfg.ScheduleAM, syncH.RunScheduled); err != nil {
		log.Printf("scheduler AM: %v", err)
	}
	if err := sched.Add(cfg.SchedulePM, syncH.RunScheduled); err != nil {
		log.Printf("scheduler PM: %v", err)
	}
	sched.Start()
	defer sched.Stop()

	// HTTP server
	router := api.NewRouter(pool, cfg.EncryptionKey)
	srv := &http.Server{
		Addr:    ":" + cfg.ServerPort,
		Handler: router,
	}

	go func() {
		log.Printf("server listening on :%s", cfg.ServerPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down...")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	srv.Shutdown(shutCtx)
}
